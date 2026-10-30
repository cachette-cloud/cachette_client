import asyncio
import time
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI, Depends, Request

from app.core.rate_limiter import (
    Token_Bucket_Rate_Limiter,
    start_rate_limiter_pruning,
    stop_rate_limiter_pruning,
    reset_all_limiters,
)
from app.dependencies import rate_limit


@pytest.mark.asyncio
async def test_token_bucket_basic_allow_and_block():
    """Verify that requests are allowed up to capacity and blocked when exhausted."""
    limiter = Token_Bucket_Rate_Limiter(
        capacity=3,
        refill_rate=0.1,  # slow refill
        key_prefix="test:basic",
    )
    await limiter.reset()

    # First 3 should pass
    assert await limiter.check("user_1") is True
    assert await limiter.check("user_1") is True
    assert await limiter.check("user_1") is True

    # 4th request should be blocked
    assert await limiter.check("user_1") is False


@pytest.mark.asyncio
async def test_token_bucket_refill():
    """Verify that tokens refill accurately over time up to capacity."""
    limiter = Token_Bucket_Rate_Limiter(
        capacity=2,
        refill_rate=10.0,  # 10 tokens per second = 1 token per 0.1s
        key_prefix="test:refill",
    )
    await limiter.reset()

    # Exhaust capacity
    assert await limiter.check("user_2") is True
    assert await limiter.check("user_2") is True
    assert await limiter.check("user_2") is False

    # Wait for refill (0.15s should refill ~1.5 tokens, enough for 1 token)
    await asyncio.sleep(0.15)
    assert await limiter.check("user_2") is True

    # But not enough for another immediately
    assert await limiter.check("user_2") is False


@pytest.mark.asyncio
async def test_multiple_sessions_isolation():
    """Verify that different sessions/identifiers maintain separate isolated buckets."""
    limiter = Token_Bucket_Rate_Limiter(
        capacity=2,
        refill_rate=0.01,
        key_prefix="test:multi_session",
    )
    await limiter.reset()

    # Exhaust session A
    assert await limiter.check("session_A") is True
    assert await limiter.check("session_A") is True
    assert await limiter.check("session_A") is False

    # Session B should be completely unaffected and have full capacity
    assert await limiter.check("session_B") is True
    assert await limiter.check("session_B") is True
    assert await limiter.check("session_B") is False

    # Session C should also be fresh
    assert await limiter.check("session_C") is True


@pytest.mark.asyncio
async def test_atomicity_under_high_concurrency():
    """Verify that concurrent requests for the same session do not suffer from race conditions."""
    capacity = 10
    total_concurrent_requests = 100

    limiter = Token_Bucket_Rate_Limiter(
        capacity=capacity,
        refill_rate=0.0,  # Zero refill during the burst test
        key_prefix="test:concurrency",
    )
    await limiter.reset()

    # Launch 100 concurrent requests simultaneously
    results = await asyncio.gather(
        *(limiter.check("concurrent_user") for _ in range(total_concurrent_requests))
    )

    allowed_count = sum(1 for res in results if res is True)
    blocked_count = sum(1 for res in results if res is False)

    # Exactly `capacity` requests must succeed, and the rest must fail
    assert allowed_count == capacity, f"Expected exactly {capacity} allowed, got {allowed_count}"
    assert blocked_count == total_concurrent_requests - capacity


@pytest.mark.asyncio
async def test_pruning_expired_buckets():
    """Verify that continuous pruning evicts expired buckets and preserves active ones."""
    ttl = 0.2  # 200 ms TTL
    limiter = Token_Bucket_Rate_Limiter(
        capacity=5,
        refill_rate=1.0,
        key_prefix="test:pruning",
        ttl=ttl,
        prune_interval=60.0,  # Keep background prune interval high so we can test manual prune
    )
    await limiter.reset()

    # Create entries for session_old and session_new
    await limiter.check("session_old")
    assert limiter.get_bucket_count() == 1

    # Wait past TTL for session_old
    await asyncio.sleep(ttl + 0.05)

    # Now access session_new so it is fresh
    await limiter.check("session_new")
    assert limiter.get_bucket_count() == 2

    # Run prune
    evicted = await limiter.prune()
    assert evicted == 1
    assert limiter.get_bucket_count() == 1

    # Verify session_new still exists and session_old was removed
    key_new = f"{limiter.key_prefix}:session_new"
    key_old = f"{limiter.key_prefix}:session_old"
    assert key_new in limiter._buckets
    assert key_old not in limiter._buckets


@pytest.mark.asyncio
async def test_background_pruning_loop():
    """Verify that background pruning loop continuously runs and terminates cleanly."""
    limiter = Token_Bucket_Rate_Limiter(
        capacity=5,
        refill_rate=1.0,
        key_prefix="test:bg_pruning",
        ttl=0.1,
        prune_interval=0.05,
    )
    await limiter.reset()

    # Start pruning task
    task = limiter.start_pruning()
    assert task is not None and not task.done()

    # Insert an entry
    await limiter.check("bg_user")
    assert limiter.get_bucket_count() == 1

    # Wait for prune interval + TTL to pass
    await asyncio.sleep(0.2)

    # Background task should have pruned it automatically
    assert limiter.get_bucket_count() == 0

    # Stop pruning
    await limiter.stop_pruning()
    assert limiter._prune_task is None


@pytest.mark.asyncio
async def test_memory_watermark_eviction():
    """Verify that exceeding max_buckets triggers safety eviction of oldest buckets."""
    limiter = Token_Bucket_Rate_Limiter(
        capacity=5,
        refill_rate=1.0,
        key_prefix="test:watermark",
        max_buckets=10,
    )
    await limiter.reset()

    # Insert 10 buckets
    for i in range(10):
        await limiter.check(f"user_{i}")

    assert limiter.get_bucket_count() == 10

    # Adding the 11th should trigger eviction of oldest
    await limiter.check("user_11")

    # Bucket count should now be kept under control (max_buckets - evicted + 1)
    assert limiter.get_bucket_count() <= 10


@pytest.mark.asyncio
async def test_fastapi_rate_limit_dependency():
    """Verify that FastAPI dependency returns HTTP 429 when rate limit is exceeded."""
    test_limiter = Token_Bucket_Rate_Limiter(
        capacity=2,
        refill_rate=0.0,
        key_prefix="test:api",
    )
    await test_limiter.reset()

    test_app = FastAPI()

    def get_user_id(request: Request) -> str:
        return request.headers.get("x-user-id", "default_user")

    @test_app.get("/limited", dependencies=[Depends(rate_limit(test_limiter, get_user_id))])
    async def limited_endpoint():
        return {"status": "ok"}

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request 1 & 2 pass
        r1 = await client.get("/limited", headers={"x-user-id": "client_1"})
        assert r1.status_code == 200

        r2 = await client.get("/limited", headers={"x-user-id": "client_1"})
        assert r2.status_code == 200

        # Request 3 should be rate limited with 429
        r3 = await client.get("/limited", headers={"x-user-id": "client_1"})
        assert r3.status_code == 429
        assert r3.json()["detail"] == "Too many requests"
        assert r3.headers.get("retry-after") == "1"

        # Request for different user should succeed
        r_other = await client.get("/limited", headers={"x-user-id": "client_2"})
        assert r_other.status_code == 200
