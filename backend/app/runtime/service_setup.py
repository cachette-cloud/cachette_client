"""
Native runtime service configurations for MinIO and cloudflared.
"""

import logging
from pathlib import Path
from typing import Tuple
import urllib.request

from app.config import settings
from app.runtime.downloader import BinaryDownloader
from app.runtime.supervisor import ProcessManager, ManagedProcess, is_port_available, PortConflictError

logger = logging.getLogger("cachette.runtime.services")


def setup_minio(pm: ProcessManager, downloader: BinaryDownloader) -> ManagedProcess:
    """Prepare and register MinIO native server process."""
    if "minio" in pm.processes and pm.processes["minio"].status in ("running", "ready"):
        return pm.processes["minio"]

    # 1. Port conflict validation
    if not is_port_available(settings.MINIO_PORT):
        raise PortConflictError(
            f"Port conflict: MinIO S3 API port {settings.MINIO_PORT} is already in use by another process."
        )
    if not is_port_available(settings.MINIO_CONSOLE_PORT):
        raise PortConflictError(
            f"Port conflict: MinIO Console port {settings.MINIO_CONSOLE_PORT} is already in use by another process."
        )

    # 2. Ensure executable binary is present and verified
    minio_bin = downloader.ensure_binary("minio")

    # 3. Command & Environment
    cmd = [
        str(minio_bin),
        "server",
        str(pm.minio_dir),
        "--address",
        f"127.0.0.1:{settings.MINIO_PORT}",
        "--console-address",
        f"127.0.0.1:{settings.MINIO_CONSOLE_PORT}",
    ]

    # Secrets passed strictly through env
    env = {
        "MINIO_ROOT_USER": settings.MINIO_ROOT_USER or "minioadmin",
        "MINIO_ROOT_PASSWORD": settings.MINIO_ROOT_PASSWORD or "minioadmin",
        "MINIO_BROWSER": "on",
        "MINIO_UPDATE": "off",
    }

    # 4. Readiness check via official MinIO live health endpoint
    def readiness_check() -> Tuple[bool, str]:
        health_url = f"http://127.0.0.1:{settings.MINIO_PORT}/minio/health/live"
        try:
            req = urllib.request.Request(health_url, headers={"User-Agent": "Cachette-Node/1.0"})
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return True, "MinIO is healthy and accepting requests"
        except Exception as e:
            return False, f"MinIO health probe: {e}"
        return False, "MinIO is starting..."

    return pm.register(
        name="minio",
        cmd=cmd,
        env=env,
        cwd=pm.data_dir,
        readiness_check=readiness_check,
    )


def setup_cloudflared(pm: ProcessManager, downloader: BinaryDownloader, token: str) -> ManagedProcess:
    """Prepare and register cloudflared native tunnel process."""
    if "cloudflared" in pm.processes:
        pm.processes["cloudflared"].stop(timeout=2.0)

    # 1. Ensure executable binary is present and verified
    cf_bin = downloader.ensure_binary("cloudflared")

    # 2. Command & Environment (secret token passed strictly through TUNNEL_TOKEN env)
    cmd = [
        str(cf_bin),
        "tunnel",
        "--no-autoupdate",
        "run",
    ]

    env = {
        "TUNNEL_TOKEN": token,
    }

    # 3. Readiness check via log scanning
    def readiness_check() -> Tuple[bool, str]:
        logs = pm.tail_logs("cloudflared", lines=40)
        success_indicators = [
            "Registered tunnel connection",
            "Connection registered",
            "Connected to",
            "Updated to new configuration",
        ]
        for ind in success_indicators:
            if ind.lower() in logs.lower():
                return True, "Tunnel registered successfully with Cloudflare edge"

        failure_indicators = [
            "invalid tunnel token",
            "unauthorized",
            "tunnel credentials are invalid",
            "failed to create tunnel",
        ]
        for ind in failure_indicators:
            if ind.lower() in logs.lower():
                return False, f"Cloudflared authentication failed: {ind}"

        return False, "Waiting for cloudflared tunnel registration..."

    return pm.register(
        name="cloudflared",
        cmd=cmd,
        env=env,
        cwd=pm.data_dir,
        readiness_check=readiness_check,
    )

