import asyncio
import logging
import os
import shutil
import time
from typing import Any

import httpx
from sqlalchemy import func, select, text

from app.config import settings
from app.core.redis_client import RedisClient
from app.db.session import AsyncSessionLocal, engine
from app.models.file import File
from app.service.s3_service import s3_service

logger = logging.getLogger("cachette.status")


def format_bytes(num_bytes: int | float | None) -> str:
    """
    Format raw byte integers into human-readable strings (e.g., '14.20 GB').
    WHY: Displaying raw byte integers on the status page is unreadable for human
    node operators. Standard binary prefixes (1024-based) keep metrics intuitive.
    """
    if num_bytes is None or num_bytes < 0:
        return "0 B"
    for unit in ["B", "KB", "MB", "GB", "TB", "PB"]:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}" if unit != "B" else f"{int(num_bytes)} B"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} EB"


async def check_postgres() -> dict[str, Any]:
    """
    Probe PostgreSQL database responsiveness with a 1.5s timeout.
    WHAT: Runs 'SELECT 1' over an async connection and measures roundtrip latency.
    WHY: PostgreSQL stores all file and user metadata. If this fails, the node
    cannot process file uploads or downloads.
    """
    t0 = time.perf_counter()
    try:
        async with engine.connect() as conn:
            await asyncio.wait_for(conn.execute(text("SELECT 1")), timeout=1.5)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"status": "healthy", "latency_ms": latency_ms}
    except Exception as exc:
        logger.warning(f"Postgres health check failed: {exc}")
        return {"status": "unhealthy", "error": str(exc)}


async def check_redis() -> dict[str, Any]:
    """
    Probe Redis client responsiveness with a 1.5s timeout.
    WHAT: Sends a PING command to Redis via RedisClient.ping().
    WHY: Redis handles rate limiting and session states. On a low-spec node,
    Redis might be optional or degraded, so failure here degrades rather than
    kills the node.
    """
    try:
        is_alive = await asyncio.wait_for(RedisClient.ping(), timeout=1.5)
        if is_alive:
            return {"status": "healthy"}
        return {"status": "unhealthy", "error": "Ping returned False"}
    except Exception as exc:
        logger.warning(f"Redis health check failed: {exc}")
        return {"status": "unhealthy", "error": str(exc)}


async def check_s3() -> dict[str, Any]:
    """
    Probe MinIO / S3 object storage responsiveness with a 1.5s timeout.
    WHAT: Executes head_bucket on the configured S3_BUCKET_NAME.
    WHY: MinIO/S3 holds actual file bytes. Verifying the bucket exists and responds
    ensures storage I/O is ready without downloading or listing objects.
    """
    if not settings.S3_BUCKET_NAME:
        return {"status": "not_configured", "bucket": None}

    try:
        async with s3_service._client() as client:
            await asyncio.wait_for(
                client.head_bucket(Bucket=s3_service.bucket),
                timeout=1.5,
            )
        return {"status": "healthy", "bucket": s3_service.bucket}
    except Exception as exc:
        logger.warning(f"S3/MinIO health check failed: {exc}")
        return {"status": "unhealthy", "bucket": s3_service.bucket, "error": str(exc)}


async def check_storage() -> dict[str, Any]:
    """
    Fetch storage capacity and Cachette object volume.
    WHAT:
      1. Uses OS shutil.disk_usage to read filesystem bytes (total, used, free).
      2. Runs a fast SQL aggregate (SUM of sizes for active files) to get Cachette's share.
    WHY:
      Querying MinIO for bucket size requires either scanning all objects (O(N) latency)
      or MinIO admin API credentials. shutil.disk_usage is instant (O(1)), works on all
      OS platforms and Docker volume mounts, and requires zero extra dependencies.
    """
    # 1. Physical disk / volume usage
    storage_path = settings.STORAGE_PATH or "/"
    if not os.path.exists(storage_path):
        storage_path = os.path.abspath(".")

    try:
        disk = shutil.disk_usage(storage_path)
        disk_total = disk.total
        disk_used = disk.used
        disk_free = disk.free
        percent_used = round((disk_used / disk_total * 100), 1) if disk_total > 0 else 0.0
    except Exception as exc:
        logger.warning(f"Failed to read disk usage: {exc}")
        disk_total = 0
        disk_used = 0
        disk_free = 0
        percent_used = 0.0

    # 2. Cachette managed file volume from database metadata
    cachette_bytes = 0
    cachette_file_count = 0
    try:
        async with AsyncSessionLocal() as session:
            query = select(
                func.coalesce(func.sum(File.size), 0),
                func.count(File.id),
            ).where(File.status == "active")
            result = await asyncio.wait_for(session.execute(query), timeout=1.5)
            row = result.first()
            if row:
                cachette_bytes = row[0] or 0
                cachette_file_count = row[1] or 0
    except Exception as exc:
        logger.warning(f"Failed to query Cachette file stats from database: {exc}")

    return {
        "path": storage_path,
        "disk": {
            "total_bytes": disk_total,
            "used_bytes": disk_used,
            "free_bytes": disk_free,
            "total_human": format_bytes(disk_total),
            "used_human": format_bytes(disk_used),
            "free_human": format_bytes(disk_free),
            "percent_used": percent_used,
        },
        "cachette": {
            "bytes": cachette_bytes,
            "bytes_human": format_bytes(cachette_bytes),
            "file_count": cachette_file_count,
        },
    }


async def check_tunnel() -> dict[str, Any]:
    """
    Probe local cloudflared tunnel daemon status with a 1.0s timeout.
    WHAT: Sends an HTTP GET request to cloudflared's local readiness probe (default :2026/ready).
    WHY:
      Cloudflared runs as a background process or container on the node. Rather than
      calling external Cloudflare APIs (which require tokens and fail if internet is down),
      polling the daemon's local port reveals if the tunnel client is running and connected.
    """
    metrics_url = settings.CLOUDFLARED_METRICS_URL
    if not metrics_url:
        return {
            "status": "not_configured",
            "message": "CLOUDFLARED_METRICS_URL not configured",
        }

    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            resp = await client.get(metrics_url)
            if resp.status_code == 200:
                return {
                    "status": "connected",
                    "url": metrics_url,
                    "message": "Tunnel is active and connected",
                }
            return {
                "status": "degraded",
                "url": metrics_url,
                "message": f"Cloudflared returned HTTP {resp.status_code}",
            }
    except Exception as exc:
        # Expected when cloudflared is offline or not installed on this machine
        return {
            "status": "disconnected",
            "url": metrics_url,
            "message": "Cloudflared daemon is unreachable or offline",
        }


async def get_node_status() -> dict[str, Any]:
    """
    Consolidate all node diagnostics concurrently.
    WHAT: Runs postgres, redis, s3, storage, and tunnel checks via asyncio.gather.
    WHY: Running checks in parallel ensures total status latency is bounded by the
    slowest check (max 1.5s) even when multiple services are disconnected.
    """
    postgres_res, redis_res, s3_res, storage_res, tunnel_res = await asyncio.gather(
        check_postgres(),
        check_redis(),
        check_s3(),
        check_storage(),
        check_tunnel(),
        return_exceptions=True,
    )

    # Normalize exceptions in case gather caught an unexpected crash
    def sanitize(res: Any, fallback: str) -> dict[str, Any]:
        if isinstance(res, Exception):
            return {"status": "unhealthy", "error": str(res)}
        if isinstance(res, dict):
            return res
        return {"status": fallback}

    pg_data = sanitize(postgres_res, "unhealthy")
    redis_data = sanitize(redis_res, "unhealthy")
    s3_data = sanitize(s3_res, "unhealthy")
    tunnel_data = sanitize(tunnel_res, "disconnected")
    storage_data = (
        storage_res
        if isinstance(storage_res, dict)
        else {
            "path": settings.STORAGE_PATH,
            "disk": {
                "total_bytes": 0,
                "used_bytes": 0,
                "free_bytes": 0,
                "total_human": "0 B",
                "used_human": "0 B",
                "free_human": "0 B",
                "percent_used": 0.0,
            },
            "cachette": {"bytes": 0, "bytes_human": "0 B", "file_count": 0},
        }
    )

    # Determine overall running state
    # Critical: PostgreSQL must be healthy.
    # Non-critical: S3, Redis, Tunnel (degraded if down, but node remains accessible)
    if pg_data.get("status") != "healthy":
        running_state = "unhealthy"
    elif (
        s3_data.get("status") != "healthy"
        or redis_data.get("status") != "healthy"
        or tunnel_data.get("status") == "disconnected"
    ):
        running_state = "degraded"
    else:
        running_state = "healthy"

    return {
        "running_state": running_state,
        "services": {
            "postgres": pg_data,
            "redis": redis_data,
            "s3": s3_data,
        },
        "storage": storage_data,
        "tunnel": tunnel_data,
        "timestamp": time.time(),
    }
