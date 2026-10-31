"""
Verification script for live FastAPI application with in-memory rate limiting.
Confirms that /signup, /login, /refresh, and /me enforce limits and return HTTP 429 with Retry-After,
and normal requests succeed, all running with NO Redis service.
"""

import asyncio
from unittest.mock import AsyncMock, patch
import os
import sys
import time
import uuid
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from jose import jwt
import httpx
import uvicorn

# Mock out external services that would timeout when not running on home PC
from app.service import s3_service, tunnel_service
s3_service.s3_service.ensure_bucket_exists = AsyncMock()
tunnel_service.ensure_cloudflared_on_startup = AsyncMock()

from app.main import app
from app.config import settings
from app.core.rate_limiter import default_rate_limiter
from app.db import engine
from app.db.base import Base


async def run_live_verification():
    print("=" * 60)
    print("STARTING LIVE FASTAPI APP RATE LIMITER VERIFICATION (NO REDIS)")
    print("=" * 60)

    # 1. Setup local sqlite database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Setup RS256 key for authenticating against /me
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    settings.PUBLIC_KEY = public_pem
    default_rate_limiter.clear()

    # Generate token for /me
    user_id = str(uuid.uuid4())
    token = jwt.encode(
        {"sub": user_id, "ver": 1, "type": "access", "display_name": "Live Test User"},
        private_pem,
        algorithm="RS256",
    )
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 3. Start uvicorn server in a background task on port 8009
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8009, log_level="warning")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())

    # Wait for server to be responsive
    connected = False
    for attempt in range(30):
        try:
            async with httpx.AsyncClient(base_url="http://127.0.0.1:8009", timeout=1.0) as client:
                res = await client.get("/health")
                if res.status_code == 200:
                    connected = True
                    break
        except Exception:
            await asyncio.sleep(0.2)

    assert connected, "Failed to connect to local uvicorn server!"
    print("[PASS] Server online and responsive on http://127.0.0.1:8009")

    try:
        async with httpx.AsyncClient(base_url="http://127.0.0.1:8009", timeout=10.0) as client:
            # Check /health probe
            health_resp = await client.get("/health")
            assert health_resp.status_code == 200, f"/health failed: {health_resp.status_code}"
            print("[PASS] /health probe returned 200 OK")

            # Verify /signup (Capacity 5, refill 0.2)
            print("\nTesting /signup endpoint past limits:")
            for i in range(5):
                resp = await client.post("/signup")
                assert resp.status_code == 200, f"/signup call {i+1} failed: {resp.status_code}"
            resp = await client.post("/signup")
            assert resp.status_code == 429, f"Expected 429 on /signup, got {resp.status_code}"
            retry_after = resp.headers.get("Retry-After")
            assert retry_after and int(retry_after) >= 1
            print(f"[PASS] /signup: 5 calls succeeded (200), 6th denied with 429, Retry-After={retry_after}s")

            # Verify /login (Capacity 5, refill 0.2)
            client_ip_headers = {"X-Forwarded-For": "192.168.1.10"}
            print("\nTesting /login endpoint past limits:")
            for i in range(5):
                resp = await client.post("/login", headers=client_ip_headers)
                assert resp.status_code == 200, f"/login call {i+1} failed: {resp.status_code}"
            resp = await client.post("/login", headers=client_ip_headers)
            assert resp.status_code == 429, f"Expected 429 on /login, got {resp.status_code}"
            retry_after = resp.headers.get("Retry-After")
            assert retry_after and int(retry_after) >= 1
            print(f"[PASS] /login: 5 calls succeeded (200), 6th denied with 429, Retry-After={retry_after}s")

            # Verify /refresh (Capacity 5, refill 0.2)
            refresh_ip_headers = {"X-Forwarded-For": "192.168.1.20"}
            print("\nTesting /refresh endpoint past limits:")
            for i in range(5):
                resp = await client.post("/refresh", headers=refresh_ip_headers)
                assert resp.status_code == 200, f"/refresh call {i+1} failed: {resp.status_code}"
            resp = await client.post("/refresh", headers=refresh_ip_headers)
            assert resp.status_code == 429, f"Expected 429 on /refresh, got {resp.status_code}"
            retry_after = resp.headers.get("Retry-After")
            assert retry_after and int(retry_after) >= 1
            print(f"[PASS] /refresh: 5 calls succeeded (200), 6th denied with 429, Retry-After={retry_after}s")

            # Verify /me (general_limiter capacity 40, refill 0.5)
            print("\nTesting /me endpoint past limits (general_limiter):")
            for i in range(settings.GENERAL_BUCKET_CAPACITY):
                resp = await client.get("/me", headers=auth_headers)
                assert resp.status_code == 200, f"/me call {i+1} failed: {resp.status_code} - {resp.text}"
            resp = await client.get("/me", headers=auth_headers)
            assert resp.status_code == 429, f"Expected 429 on /me, got {resp.status_code}"
            retry_after = resp.headers.get("Retry-After")
            assert retry_after and int(retry_after) >= 1
            print(f"[PASS] /me: {settings.GENERAL_BUCKET_CAPACITY} calls succeeded (200), {settings.GENERAL_BUCKET_CAPACITY+1}th denied with 429, Retry-After={retry_after}s")

            # Verify normal requests to other unthrottled endpoints continue to succeed
            health_resp_again = await client.get("/health")
            assert health_resp_again.status_code == 200
            print("\n[PASS] Unthrottled /health probe continues to succeed with 200 OK")

    finally:
        server.should_exit = True
        await server_task

    print("\n" + "=" * 60)
    print("LIVE APP RATE LIMITING VERIFICATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_live_verification())
