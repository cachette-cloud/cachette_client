"""
In-memory sharded token bucket rate limiter.

Design Notes:
- Runs in-process with zero external dependencies (no Redis).
- State is sharded across N buckets, each guarded by a standard threading.Lock
  to guarantee atomic read-refill-check-decrement operations across both async
  event loops and sync threadpool endpoints.
- Idle-full pruning rationale:
  A token bucket idle for >= (capacity / refill_rate) seconds has naturally
  refilled back to 100% capacity. Deleting it is lossless: if the key is
  accessed again later, initializing a fresh bucket with full capacity produces
  the exact same semantic behavior as retaining the idle one.
- Limits are per-process. Cachette Node is designed to run as a single process
  (single uvicorn worker).
"""

import asyncio
from collections import OrderedDict
import logging
import math
import threading
import time
from typing import Callable, NamedTuple

from app.config import settings

logger = logging.getLogger(__name__)


class BucketState(NamedTuple):
    tokens: float
    last_refill: float
    max_idle_ttl: float


class Shard:
    """Thread-safe shard holding a slice of rate limit keys with LRU eviction."""

    def __init__(self, max_keys: int):
        self.lock = threading.Lock()
        self.data: OrderedDict[str, BucketState] = OrderedDict()
        self.max_keys = max_keys


class InMemoryRateLimiter:
    """
    Sharded, in-memory token bucket rate limiter.
    
    Provides thread-safe atomic token checks, lazy refills, LRU memory bounds,
    idle-full pruning, and an injectable clock for deterministic testing.
    """

    def __init__(
        self,
        num_shards: int = settings.RATE_LIMIT_SHARDS,
        max_keys_per_shard: int = settings.RATE_LIMIT_MAX_KEYS_PER_SHARD,
        sweep_interval: float = settings.RATE_LIMIT_SWEEP_INTERVAL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.num_shards = max(1, num_shards)
        self.max_keys_per_shard = max(1, max_keys_per_shard)
        self.sweep_interval = sweep_interval
        self.clock = clock
        self.shards = [Shard(max_keys=self.max_keys_per_shard) for _ in range(self.num_shards)]
        self._sweeper_task: asyncio.Task | None = None

    def _get_shard(self, key: str) -> Shard:
        # Standard hash-based sharding
        shard_idx = hash(key) % self.num_shards
        return self.shards[shard_idx]

    def allow(
        self,
        key: str,
        capacity: float,
        refill_rate: float,
        cost: float = 1.0,
    ) -> tuple[bool, int, float]:
        """
        Atomically check and consume tokens for a key.

        Args:
            key: Unique rate limit identifier (e.g. 'ip:1.2.3.4' or 'user:123').
            capacity: Maximum burst capacity of the token bucket.
            refill_rate: Number of tokens added per second.
            cost: Tokens requested for this operation (default 1.0).

        Returns:
            Tuple of (allowed, remaining_tokens, retry_after_seconds).
        """
        shard = self._get_shard(key)
        now = self.clock()
        max_idle_ttl = (capacity / refill_rate) if refill_rate > 0 else float("inf")

        with shard.lock:
            if key in shard.data:
                tokens, last_refill, _ = shard.data[key]
                shard.data.move_to_end(key)
                elapsed = max(0.0, now - last_refill)
                tokens = min(float(capacity), tokens + elapsed * refill_rate)
            else:
                tokens = float(capacity)
                if len(shard.data) >= shard.max_keys:
                    # LRU eviction: pop least recently used item (first item in OrderedDict)
                    shard.data.popitem(last=False)

            if tokens >= cost:
                tokens -= cost
                allowed = True
                retry_after = 0.0
            else:
                allowed = False
                missing = cost - tokens
                retry_after = (missing / refill_rate) if refill_rate > 0 else 0.0

            shard.data[key] = BucketState(tokens=tokens, last_refill=now, max_idle_ttl=max_idle_ttl)
            return allowed, int(tokens), retry_after

    def prune_idle(self, now: float | None = None) -> int:
        """
        Prune idle-full buckets across all shards.
        
        A bucket idle for >= max_idle_ttl is guaranteed to have refilled to full
        capacity; removing it is completely safe and frees memory.
        """
        current_time = self.clock() if now is None else now
        pruned_total = 0

        for shard in self.shards:
            with shard.lock:
                keys_to_remove = [
                    k for k, state in shard.data.items()
                    if (current_time - state.last_refill) >= state.max_idle_ttl
                ]
                for k in keys_to_remove:
                    del shard.data[k]
                    pruned_total += 1

        return pruned_total

    def get_key_count(self) -> int:
        """Return the current total number of tracked keys across all shards."""
        total = 0
        for shard in self.shards:
            with shard.lock:
                total += len(shard.data)
        return total

    def clear(self) -> None:
        """Clear all keys from all shards (useful for test resets)."""
        for shard in self.shards:
            with shard.lock:
                shard.data.clear()

    async def run_sweeper(self) -> None:
        """Background asyncio loop to prune idle-full buckets periodically."""
        logger.info(f"Rate limiter sweeper started (interval: {self.sweep_interval}s)")
        try:
            while True:
                await asyncio.sleep(self.sweep_interval)
                now = self.clock()
                for shard in self.shards:
                    with shard.lock:
                        keys_to_remove = [
                            k for k, state in shard.data.items()
                            if (now - state.last_refill) >= state.max_idle_ttl
                        ]
                        for k in keys_to_remove:
                            del shard.data[k]
                    # Yield briefly between shards so locks are held minimally
                    await asyncio.sleep(0)
        except asyncio.CancelledError:
            logger.info("Rate limiter sweeper task cancelled cleanly.")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in rate limiter sweeper: {e}")


# Process-wide default in-memory rate limiter instance
default_rate_limiter = InMemoryRateLimiter()


class Token_Bucket_Rate_Limiter:
    """
    Route dependency wrapper around InMemoryRateLimiter.
    Keeps the call shape existing routes and dependencies use.
    """

    def __init__(
        self,
        capacity: int,
        refill_rate: float,
        key_prefix: str,
        store: InMemoryRateLimiter | None = None,
    ):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.key_prefix = key_prefix
        self.store = store or default_rate_limiter

    def allow(self, identifier: str, cost: int = 1) -> tuple[bool, int, float]:
        """
        Check rate limit and consume tokens.
        
        Returns:
            (allowed, remaining_tokens, retry_after_seconds)
        """
        full_key = f"{self.key_prefix}:{identifier}"
        return self.store.allow(
            key=full_key,
            capacity=self.capacity,
            refill_rate=self.refill_rate,
            cost=cost,
        )

    async def check(self, identifier: str, cost: int = 1) -> bool:
        """Async compatibility method for older callers."""
        allowed, _, _ = self.allow(identifier=identifier, cost=cost)
        return allowed
