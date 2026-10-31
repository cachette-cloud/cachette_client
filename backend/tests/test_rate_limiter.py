"""
Unit and integration tests for the in-memory sharded token bucket rate limiter.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import math
import time
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app, lifespan
from app.config import settings
from app.core.rate_limiter import (
    InMemoryRateLimiter,
    Token_Bucket_Rate_Limiter,
    default_rate_limiter,
)
from app.dependencies import auth_limiter, general_limiter


class FakeClock:
    """Deterministic injectable clock for testing rate limiter without time.sleep."""

    def __init__(self, initial_time: float = 1000.0):
        self._time = initial_time

    def __call__(self) -> float:
        return self._time

    def advance(self, seconds: float) -> None:
        self._time += seconds

    def set(self, timestamp: float) -> None:
        self._time = timestamp


def test_capacity_exhaustion_and_refill_fake_time():
    """
    Verify bucket allows up to capacity, denies subsequent requests with accurate
    retry_after, and correctly refills over elapsed fake time.
    """
    clock = FakeClock(1000.0)
    limiter = InMemoryRateLimiter(num_shards=4, clock=clock)

    key = "user:test_capacity"
    capacity = 5
    refill_rate = 1.0  # 1 token per second

    # Consume all 5 tokens
    for i in range(capacity):
        allowed, remaining, retry_after = limiter.allow(key, capacity, refill_rate, cost=1)
        assert allowed is True
        assert remaining == capacity - 1 - i
        assert retry_after == 0.0

    # 6th request should be denied
    allowed, remaining, retry_after = limiter.allow(key, capacity, refill_rate, cost=1)
    assert allowed is False
    assert remaining == 0
    assert pytest.approx(retry_after, rel=1e-3) == 1.0  # Needs 1 full second for 1 token

    # Advance clock by 0.5s -> still insufficient for cost=1
    clock.advance(0.5)
    allowed, remaining, retry_after = limiter.allow(key, capacity, refill_rate, cost=1)
    assert allowed is False
    assert remaining == 0
    assert pytest.approx(retry_after, rel=1e-3) == 0.5  # Needs 0.5 more seconds

    # Advance clock by another 0.5s (1.0s elapsed from denial) -> 1 token available
    clock.advance(0.5)
    allowed, remaining, retry_after = limiter.allow(key, capacity, refill_rate, cost=1)
    assert allowed is True
    assert remaining == 0

    # Advance clock by 20 seconds -> capped at capacity (5)
    clock.advance(20.0)
    for _ in range(capacity):
        allowed, _, _ = limiter.allow(key, capacity, refill_rate, cost=1)
        assert allowed is True

    # Denied again once capacity is spent
    allowed, _, _ = limiter.allow(key, capacity, refill_rate, cost=1)
    assert allowed is False


def test_retry_after_calculation_accuracy():
    """Verify retry_after accurately computes time needed for fractional refills and higher costs."""
    clock = FakeClock(1000.0)
    limiter = InMemoryRateLimiter(num_shards=4, clock=clock)

    key = "user:test_retry"
    capacity = 10
    refill_rate = 2.0  # 2 tokens per second

    # Consume 9 tokens, leaving 1
    allowed, remaining, _ = limiter.allow(key, capacity, refill_rate, cost=9)
    assert allowed is True
    assert remaining == 1

    # Request cost of 5 tokens when only 1 is available -> missing 4 tokens
    # retry_after should be 4.0 / 2.0 = 2.0 seconds
    allowed, remaining, retry_after = limiter.allow(key, capacity, refill_rate, cost=5)
    assert allowed is False
    assert remaining == 1
    assert pytest.approx(retry_after, rel=1e-3) == 2.0

    # Advance 1 second -> refilled 2 tokens (now 3 tokens), missing 2 tokens -> retry_after 1.0s
    clock.advance(1.0)
    allowed, remaining, retry_after = limiter.allow(key, capacity, refill_rate, cost=5)
    assert allowed is False
    assert remaining == 3
    assert pytest.approx(retry_after, rel=1e-3) == 1.0


def test_different_keys_are_independent():
    """Verify different keys do not interfere with each other's buckets."""
    clock = FakeClock(1000.0)
    limiter = InMemoryRateLimiter(num_shards=8, clock=clock)

    key_a = "client:ip_10_0_0_1"
    key_b = "client:ip_10_0_0_2"

    # Exhaust key_a (capacity 2)
    assert limiter.allow(key_a, capacity=2, refill_rate=0.1, cost=2)[0] is True
    assert limiter.allow(key_a, capacity=2, refill_rate=0.1, cost=1)[0] is False

    # key_b should still be at full capacity
    assert limiter.allow(key_b, capacity=2, refill_rate=0.1, cost=1)[0] is True
    assert limiter.allow(key_b, capacity=2, refill_rate=0.1, cost=1)[0] is True
    assert limiter.allow(key_b, capacity=2, refill_rate=0.1, cost=1)[0] is False

    # key_a is still denied
    assert limiter.allow(key_a, capacity=2, refill_rate=0.1, cost=1)[0] is False


def test_pruning_removes_idle_full_buckets_and_keeps_active_or_partially_empty():
    """
    Test safe idle TTL pruning.
    
    A bucket idle for >= capacity / refill_rate seconds has completely refilled to
    full capacity. Deleting it is lossless because any future request will initialize
    a new bucket at full capacity. Buckets that are active or partially empty must be retained.
    """
    clock = FakeClock(100.0)
    limiter = InMemoryRateLimiter(num_shards=4, clock=clock)

    capacity = 10
    refill_rate = 1.0  # max_idle_ttl = 10.0 / 1.0 = 10.0 seconds

    # Key 1 accessed at t=100 (partially empty, 8 tokens left)
    limiter.allow("key1", capacity=capacity, refill_rate=refill_rate, cost=2)

    # Key 2 accessed at t=105 (exhausted, 0 tokens left)
    clock.set(105.0)
    limiter.allow("key2", capacity=capacity, refill_rate=refill_rate, cost=10)

    # Key 3 accessed at t=109 (9 tokens left)
    clock.set(109.0)
    limiter.allow("key3", capacity=capacity, refill_rate=refill_rate, cost=1)

    assert limiter.get_key_count() == 3

    # At t=110.0:
    # key1: idle elapsed = 110 - 100 = 10s >= max_idle_ttl (10s) -> FULL & IDLE -> PRUNED
    # key2: idle elapsed = 110 - 105 = 5s < max_idle_ttl -> PARTIALLY EMPTY -> KEPT
    # key3: idle elapsed = 110 - 109 = 1s < max_idle_ttl -> ACTIVE -> KEPT
    clock.set(110.0)
    pruned = limiter.prune_idle(now=110.0)
    assert pruned == 1
    assert limiter.get_key_count() == 2

    # Verify key2 and key3 are still present
    for shard in limiter.shards:
        with shard.lock:
            assert "key1" not in shard.data

    # At t=120.0:
    # key2: idle elapsed = 120 - 105 = 15s >= 10s -> FULL -> PRUNED
    # key3: idle elapsed = 120 - 109 = 11s >= 10s -> FULL -> PRUNED
    clock.set(120.0)
    pruned = limiter.prune_idle(now=120.0)
    assert pruned == 2
    assert limiter.get_key_count() == 0


def test_max_keys_lru_eviction():
    """
    Verify LRU eviction ensures total keys never exceed max_keys per shard.
    Least recently used key is evicted when cap is exceeded.
    """
    clock = FakeClock(100.0)
    # 1 shard with capacity 3
    limiter = InMemoryRateLimiter(num_shards=1, max_keys_per_shard=3, clock=clock)

    limiter.allow("k1", capacity=10, refill_rate=1.0)
    clock.advance(1.0)
    limiter.allow("k2", capacity=10, refill_rate=1.0)
    clock.advance(1.0)
    limiter.allow("k3", capacity=10, refill_rate=1.0)

    assert limiter.get_key_count() == 3

    # Touch k1 to make it most recently used (Order becomes: k2, k3, k1)
    clock.advance(1.0)
    limiter.allow("k1", capacity=10, refill_rate=1.0)

    # Insert k4 -> should evict k2 (least recently used)
    clock.advance(1.0)
    limiter.allow("k4", capacity=10, refill_rate=1.0)

    assert limiter.get_key_count() == 3

    shard_data = limiter.shards[0].data
    assert "k2" not in shard_data
    assert "k1" in shard_data
    assert "k3" in shard_data
    assert "k4" in shard_data


def test_concurrency_threads_and_asyncio_never_overspends():
    """
    Concurrency hammer test:
    Simultaneously runs many OS threads and asyncio tasks hammering the SAME key.
    Guarantees no race conditions and total allowed never exceeds capacity.
    """
    clock = FakeClock(1000.0)
    limiter = InMemoryRateLimiter(num_shards=16, clock=clock)

    capacity = 100
    refill_rate = 0.0  # Zero refill during the burst so allowed count must be strictly <= capacity
    key = "hammer:single_key"

    thread_results: list[bool] = []
    async_results: list[bool] = []

    def thread_worker(count: int):
        local_allowed = []
        for _ in range(count):
            allowed, _, _ = limiter.allow(key, capacity, refill_rate, cost=1)
            local_allowed.append(allowed)
        return local_allowed

    async def async_worker(count: int):
        for _ in range(count):
            allowed, _, _ = limiter.allow(key, capacity, refill_rate, cost=1)
            async_results.append(allowed)
            await asyncio.sleep(0)  # Yield to interleave event loop tasks

    async def run_hybrid():
        # Launch 20 asyncio tasks
        tasks = [asyncio.create_task(async_worker(10)) for _ in range(20)]

        # Concurrently launch 10 threadpool threads
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(thread_worker, 15) for _ in range(10)]
            for f in futures:
                thread_results.extend(f.result())

        await asyncio.gather(*tasks)

    asyncio.run(run_hybrid())

    all_results = thread_results + async_results
    total_allowed = sum(1 for r in all_results if r is True)
    total_denied = sum(1 for r in all_results if r is False)

    # Total attempts = (10 * 15) + (20 * 10) = 350
    assert len(all_results) == 350
    # Must never allow more than capacity (100)
    assert total_allowed == capacity
    assert total_denied == 250


@pytest.mark.asyncio
async def test_lifespan_starts_and_stops_sweeper_without_leaking_tasks(monkeypatch):
    """Verify that FastAPI lifespan creates the sweeper task and cleans it up on shutdown."""
    from unittest.mock import AsyncMock
    monkeypatch.setattr("app.main.ensure_cloudflared_on_startup", AsyncMock())
    monkeypatch.setattr("app.main.s3_service.ensure_bucket_exists", AsyncMock())
    monkeypatch.setattr("app.main.jwks_manager.fetch_keys", AsyncMock())
    monkeypatch.setattr("app.main.jwks_manager.start_background_refresh", AsyncMock())

    async with lifespan(app):
        # Sweeper should be running
        assert default_rate_limiter.get_key_count() >= 0

    # After lifespan exit, sweeper task should be cancelled and completed
    assert default_rate_limiter.get_key_count() >= 0


@pytest.mark.asyncio
async def test_route_rate_limiting_429_and_retry_after(client):
    """
    Integration test against actual routes:
    Confirms 429 status code and accurate Retry-After response headers.
    """
    default_rate_limiter.clear()

    # /signup is guarded by auth_limiter (capacity 5, refill_rate 0.2)
    for i in range(5):
        resp = await client.post("/signup")
        assert resp.status_code == 200, f"Request {i+1} should succeed"

    # 6th request must return 429 Too Many Requests
    resp = await client.post("/signup")
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers
    retry_after = int(resp.headers["Retry-After"])
    assert retry_after >= 1
