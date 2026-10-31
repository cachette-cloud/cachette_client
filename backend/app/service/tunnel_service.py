import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.config import (
    BACKEND_ENV_PATH,
    PAIRING_CREDENTIALS_PATH,
    ROOT_ENV_PATH,
    settings,
)
from app.runtime import get_process_manager, BinaryDownloader
from app.runtime.service_setup import setup_cloudflared

logger = logging.getLogger("cachette.tunnel")

# In-memory tracking of tunnel lifecycle state
_tunnel_state: Dict[str, Any] = {
    "status": "unpaired",  # "unpaired" | "starting" | "ready" | "failed"
    "ready": False,
    "error": None,
    "updated_at": datetime.now(timezone.utc).isoformat(),
}


def _update_state(status: str, ready: bool = False, error: Optional[str] = None) -> None:
    _tunnel_state["status"] = status
    _tunnel_state["ready"] = ready
    _tunnel_state["error"] = error
    _tunnel_state["updated_at"] = datetime.now(timezone.utc).isoformat()


def get_tunnel_status() -> Dict[str, Any]:
    """Return the current in-memory cloudflared tunnel lifecycle status."""
    return {
        "status": _tunnel_state["status"],
        "ready": _tunnel_state["ready"],
        "error": _tunnel_state["error"],
        "updated_at": _tunnel_state["updated_at"],
    }


def write_tunnel_token_to_env(token: str) -> None:
    """
    Persist CF_TUNNEL_TOKEN into the .env files,
    preserving existing environment variables and comments.
    """
    paths_to_update = [ROOT_ENV_PATH, BACKEND_ENV_PATH]

    for env_path in paths_to_update:
        try:
            lines = []
            found = False
            if env_path.exists():
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith("CF_TUNNEL_TOKEN="):
                            lines.append(f"CF_TUNNEL_TOKEN={token}\n")
                            found = True
                        else:
                            lines.append(line)
            if not found:
                if lines and not lines[-1].endswith("\n"):
                    lines[-1] += "\n"
                lines.append(f"CF_TUNNEL_TOKEN={token}\n")

            env_path.parent.mkdir(parents=True, exist_ok=True)
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            logger.info("Successfully updated CF_TUNNEL_TOKEN in %s", env_path)
        except Exception as e:
            logger.error("Failed to write CF_TUNNEL_TOKEN to %s: %s", env_path, e)


def start_cloudflared(token: str) -> Tuple[bool, str]:
    """
    Programmatically launch cloudflared native binary as a supervised process.
    """
    try:
        pm = get_process_manager()
        downloader = BinaryDownloader(bin_dir=pm.bin_dir)
        setup_cloudflared(pm=pm, downloader=downloader, token=token)
        started, msg = pm.start("cloudflared", wait_ready=False)
        if not started:
            logger.error(f"Failed to start cloudflared native binary: {msg}")
            return False, msg

        logger.info("Cloudflared native process started successfully")
        return True, "Cloudflared native process started"

    except Exception as e:
        msg = f"Unexpected error while launching cloudflared binary: {e}"
        logger.error(msg)
        return False, msg


async def verify_cloudflared_health(timeout: float = 30.0, poll_interval: float = 1.0) -> Tuple[bool, str]:
    """
    Verify cloudflared connection confirmation via the ProcessManager readiness check.
    """
    pm = get_process_manager()
    if "cloudflared" not in pm.processes:
        return False, "Cloudflared process not registered"

    managed = pm.processes["cloudflared"]
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, managed.wait_ready, timeout, poll_interval)


async def start_tunnel_workflow(token: str) -> None:
    """
    Asynchronous orchestrator for native cloudflared tunnel lifecycle:
    1. Writes token to .env
    2. Updates state to 'starting'
    3. Spawns cloudflared native subprocess via supervisor
    4. Waits for connection registration confirmation
    5. Updates state to 'ready' or 'failed'
    """
    if not token:
        _update_state("unpaired", False, "Missing tunnel token")
        return

    _update_state("starting", False, None)

    # 1. Update .env files
    write_tunnel_token_to_env(token)

    # 2. Start native process in executor
    loop = asyncio.get_event_loop()
    started, start_msg = await loop.run_in_executor(None, start_cloudflared, token)

    if not started:
        _update_state("failed", False, start_msg)
        return

    # 3. Verify health
    verified, verify_msg = await verify_cloudflared_health(timeout=30.0, poll_interval=1.0)

    if verified:
        _update_state("ready", True, None)
        logger.info("Cloudflared native tunnel is online and verified")
    else:
        _update_state("failed", False, verify_msg)
        logger.warning("Cloudflared native tunnel could not be verified: %s", verify_msg)


async def ensure_cloudflared_on_startup() -> None:
    """
    Invoked during application startup. If the node has previously paired credentials
    including cf_tunnel_token, automatically bring up and verify cloudflared.
    """
    if not PAIRING_CREDENTIALS_PATH.exists():
        _update_state("unpaired", False, None)
        return

    try:
        import json
        with open(PAIRING_CREDENTIALS_PATH, "r", encoding="utf-8") as f:
            creds = json.load(f)

        token = creds.get("cf_tunnel_token")
        if token and creds.get("session_token"):
            logger.info("Startup: Found persisted pairing credentials, starting native cloudflared...")
            await start_tunnel_workflow(token)
        else:
            _update_state("unpaired", False, None)
    except Exception as e:
        logger.error("Failed to read pairing credentials on startup: %s", e)
        _update_state("unpaired", False, str(e))
