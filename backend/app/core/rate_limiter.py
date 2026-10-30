import asyncio
import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TokenBucket:
    """Represents a rate-limiter bucket for an individual session/identifier."""
    tokens: float
    last_refill: float
    last_accessed: float
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_active_limiters: list["Token_Bucket_Rate_Limiter"] = []


class Token_Bucket_Rate_Limiter:
    """High-performance, atomic in-memory Token Bucket rate limiter.
    
    Replaces external Redis storage with native Python in-memory storage while
    preserving exact rate-limiting semantics and providing:
    - Atomic token refill and deduction using fine-grained per-bucket locks.
    - High-throughput concurrency: different sessions do not block each other.
    - Multi-session isolation via key prefixing and identifier namespaces.
    - Continuous background pruning and safety watermarks to prevent memory bloat.
    - Drift-free time tracking via monotonic clock (time.monotonic).
    """

    def __init__(
        self,
        capacity: int | float,
        refill_rate: float,
        key_prefix: str,
        ttl: float = 3600.0,
        prune_interval: float = 60.0,
        max_buckets: int = 100_000,
    ):
        self.capacity = float(capacity)
        self.refill_rate = float(refill_rate)
        self.key_prefix = key_prefix
        self.ttl = float(ttl)
        self.prune_interval = float(prune_interval)
        self.max_buckets = max_buckets

        self._buckets: dict[str, TokenBucket] = {}
        self._registry_lock = asyncio.Lock()
        self._prune_task: asyncio.Task | None = None
        self._closing = False

        _active_limiters.append(self)

    async def _get_or_create_bucket(self, key: str, now: float) -> TokenBucket:
        # Fast path: check if bucket already exists without acquiring registry lock
        bucket = self._buckets.get(key)
        if bucket is not None:
            return bucket

        async with self._registry_lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                # If memory reaches safety watermark, trigger eviction of oldest idle buckets
                if len(self._buckets) >= self.max_buckets:
                    await self._evict_oldest(now, count=max(1, self.max_buckets // 10))

                bucket = TokenBucket(
                    tokens=self.capacity,
                    last_refill=now,
                    last_accessed=now,
                )
                self._buckets[key] = bucket
            return bucket

    async def _evict_oldest(self, now: float, count: int) -> int:
        """Emergency eviction of oldest-accessed buckets when memory threshold is hit."""
        sorted_keys = sorted(
            self._buckets.items(),
            key=lambda item: item[1].last_accessed,
        )
        evicted = 0
        for k, b in sorted_keys[:count]:
            if self._buckets.pop(k, None) is not None:
                evicted += 1
        logger.warning(
            f"RateLimiter[{self.key_prefix}] memory threshold reached ({self.max_buckets}). "
            f"Evicted {evicted} oldest buckets."
        )
        return evicted

    async def check(self, identifier: str, cost: int = 1) -> bool:
        """Check if request with given cost is allowed under the rate limit.
        
        Operation is completely atomic per identifier.
        """
        try:
            self._ensure_prune_task_running()

            now = time.monotonic()
            key = f"{self.key_prefix}:{identifier}"
            bucket = await self._get_or_create_bucket(key, now)

            async with bucket.lock:
                now = time.monotonic()
                elapsed = max(0.0, now - bucket.last_refill)
                # Refill tokens up to maximum capacity
                bucket.tokens = min(self.capacity, bucket.tokens + elapsed * self.refill_rate)
                bucket.last_refill = now
                bucket.last_accessed = now

                if bucket.tokens >= cost:
                    bucket.tokens -= cost
                    return True
                return False
        except Exception as e:
            logger.error(f"Error in rate limiter check for {self.key_prefix}:{identifier}: {e}")
            # Fail-open: allow request if unexpected internal error occurs
            return True

    async def prune(self) -> int:
        """Continuous pruning routine to evict expired/idle buckets.
        
        Returns the number of evicted buckets.
        """
        now = time.monotonic()
        candidates: list[tuple[str, TokenBucket]] = []

        async with self._registry_lock:
            for key, bucket in list(self._buckets.items()):
                if now - bucket.last_accessed > self.ttl:
                    candidates.append((key, bucket))

        evicted_count = 0
        for key, bucket in candidates:
            # Safely acquire the bucket lock before removing to avoid race condition with active requests
            async with bucket.lock:
                if now - bucket.last_accessed > self.ttl:
                    async with self._registry_lock:
                        if self._buckets.get(key) is bucket:
                            del self._buckets[key]
                            evicted_count += 1

        if evicted_count > 0:
            logger.debug(
                f"RateLimiter[{self.key_prefix}] pruned {evicted_count} expired buckets."
            )
        return evicted_count

    async def _prune_loop(self):
        """Background coroutine that continuously prunes expired buckets."""
        try:
            while not self._closing:
                await asyncio.sleep(self.prune_interval)
                await self.prune()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in rate limiter prune loop for {self.key_prefix}: {e}")

    def _ensure_prune_task_running(self):
        """Lazily ensure background pruning task is active if event loop is running."""
        if (self._prune_task is None or self._prune_task.done()) and not self._closing:
            try:
                loop = asyncio.get_running_loop()
                if loop.is_running():
                    self.start_pruning()
            except RuntimeError:
                pass

    def start_pruning(self) -> asyncio.Task | None:
        """Start the background pruning task."""
        if self._prune_task is None or self._prune_task.done():
            self._closing = False
            try:
                self._prune_task = asyncio.create_task(
                    self._prune_loop(),
                    name=f"ratelimit-prune-{self.key_prefix}",
                )
            except RuntimeError:
                return None
        return self._prune_task

    async def stop_pruning(self):
        """Stop and wait for background pruning task to finish."""
        self._closing = True
        if self._prune_task and not self._prune_task.done():
            self._prune_task.cancel()
            try:
                await self._prune_task
            except asyncio.CancelledError:
                pass
            self._prune_task = None

    async def reset(self, identifier: str | None = None):
        """Reset state for a specific identifier or all identifiers in this limiter."""
        async with self._registry_lock:
            if identifier is None:
                self._buckets.clear()
            else:
                key = f"{self.key_prefix}:{identifier}"
                self._buckets.pop(key, None)

    def get_bucket_count(self) -> int:
        """Returns total active buckets currently tracked in memory."""
        return len(self._buckets)


def start_rate_limiter_pruning():
    """Start pruning tasks for all registered rate limiters."""
    for limiter in _active_limiters:
        limiter.start_pruning()


async def stop_rate_limiter_pruning():
    """Stop pruning tasks for all registered rate limiters."""
    for limiter in _active_limiters:
        await limiter.stop_pruning()


async def reset_all_limiters():
    """Reset all registered rate limiters (useful for testing)."""
    for limiter in _active_limiters:
        await limiter.reset()
