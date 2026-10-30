import asyncio
import collections
import logging
import os
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.config import (
    BACKEND_DIR,
    BACKEND_ENV_PATH,
    DOCKER_COMPOSE_PATH,
    PAIRING_CREDENTIALS_PATH,
    PROJECT_ROOT,
    ROOT_ENV_PATH,
)

logger = logging.getLogger("cachette.tunnel")

# In-memory tracking of tunnel lifecycle state
_tunnel_state: Dict[str, Any] = {
    "status": "unpaired",  # "unpaired" | "starting" | "ready" | "failed"
    "ready": False,
    "error": None,
    "updated_at": datetime.now(timezone.utc).isoformat(),
}

# Native cloudflared process and log tracking
_native_tunnel_process: Optional[subprocess.Popen] = None
_native_tunnel_logs: collections.deque = collections.deque(maxlen=200)
_native_reader_thread: Optional[threading.Thread] = None


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
    Persist CF_TUNNEL_TOKEN into the .env files Docker Compose reads (both root and backend),
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


def get_native_cloudflared_path() -> Optional[Path]:
    """Locate standalone native cloudflared binary (e.g. from bundled installer or PATH)."""
    if env_path := os.getenv("CLOUDFLARED_BIN_PATH"):
        p = Path(env_path)
        if p.is_file():
            return p

    candidates = [
        PROJECT_ROOT / "bin" / "cloudflared.exe",
        PROJECT_ROOT / "bin" / "cloudflared",
        BACKEND_DIR / "bin" / "cloudflared.exe",
        BACKEND_DIR / "bin" / "cloudflared",
    ]
    for c in candidates:
        if c.is_file():
            return c

    if path_bin := shutil.which("cloudflared"):
        return Path(path_bin)

    return None


def start_native_cloudflared(token: str) -> Tuple[bool, str]:
    """
    Start cloudflared as a native host subprocess (no Docker required).
    """
    global _native_tunnel_process, _native_reader_thread
    bin_path = get_native_cloudflared_path()
    if not bin_path:
        return False, "Native cloudflared binary not found"

    stop_native_cloudflared()

    cmd = [
        str(bin_path),
        "tunnel",
        "--no-autoupdate",
        "run",
        "--token",
        token,
    ]

    try:
        logger.info("Starting native cloudflared binary: %s", " ".join(cmd[:4]))
        _native_tunnel_logs.clear()

        # Prevent terminal window popup on Windows
        creationflags = 0
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=creationflags,
        )
        _native_tunnel_process = proc

        def _reader(p: subprocess.Popen):
            try:
                for line in iter(p.stdout.readline, ""):
                    if not line:
                        break
                    _native_tunnel_logs.append(line.strip())
            except Exception:
                pass

        _native_reader_thread = threading.Thread(target=_reader, args=(proc,), daemon=True)
        _native_reader_thread.start()

        logger.info("Native cloudflared spawned with PID %s", proc.pid)
        return True, "Native cloudflared started"

    except Exception as e:
        msg = f"Failed to start native cloudflared process: {e}"
        logger.error(msg)
        return False, msg


def stop_native_cloudflared() -> None:
    """Terminate running native cloudflared subprocess."""
    global _native_tunnel_process
    if _native_tunnel_process and _native_tunnel_process.poll() is None:
        try:
            logger.info("Terminating native cloudflared process (PID %s)", _native_tunnel_process.pid)
            _native_tunnel_process.terminate()
            _native_tunnel_process.wait(timeout=5)
        except Exception:
            try:
                _native_tunnel_process.kill()
            except Exception:
                pass
    _native_tunnel_process = None


def _get_docker_compose_cmd() -> Optional[list[str]]:
    """Determine whether 'docker compose' or 'docker-compose' is available."""
    docker_bin = shutil.which("docker")
    if docker_bin:
        try:
            res = subprocess.run(
                [docker_bin, "compose", "version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if res.returncode == 0:
                return [docker_bin, "compose"]
        except Exception:
            pass

    compose_bin = shutil.which("docker-compose")
    if compose_bin:
        return [compose_bin]

    return None


def start_cloudflared(token: str) -> Tuple[bool, str]:
    """
    Programmatically bring up or recreate the cloudflared service container.
    Handles Docker daemon errors and missing compose files gracefully.
    """
    if not DOCKER_COMPOSE_PATH.exists():
        msg = f"Docker compose file not found at {DOCKER_COMPOSE_PATH}"
        logger.error(msg)
        return False, msg

    cmd_prefix = _get_docker_compose_cmd()
    if not cmd_prefix:
        msg = "Docker or Docker Compose command not found on system PATH"
        logger.error(msg)
        return False, msg

    compose_cmd = cmd_prefix + [
        "-f",
        str(DOCKER_COMPOSE_PATH),
        "--profile",
        "tunnel",
        "up",
        "-d",
        "--force-recreate",
        "cloudflared",
    ]

    env = os.environ.copy()
    env["CF_TUNNEL_TOKEN"] = token

    try:
        logger.info("Starting cloudflared container: %s", " ".join(compose_cmd))
        result = subprocess.run(
            compose_cmd,
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )

        combined_output = (result.stdout + "\n" + result.stderr).strip()

        if result.returncode != 0:
            if "Cannot connect to the Docker daemon" in combined_output or "docker API" in combined_output:
                msg = "Docker daemon is unreachable. Run 'docker compose --profile tunnel up -d cloudflared' on your host to start the tunnel."
            else:
                msg = f"Docker compose up failed (code {result.returncode}): {combined_output[:300]}. Run 'docker compose --profile tunnel up -d cloudflared' to start manually."
            logger.warning("Cloudflared container startup failed: %s", msg)
            return False, msg

        logger.info("Cloudflared container started successfully via Docker compose")
        return True, "Cloudflared container started"

    except subprocess.TimeoutExpired:
        msg = "Docker compose command timed out after 30 seconds"
        logger.error(msg)
        return False, msg
    except Exception as e:
        msg = f"Unexpected error while starting cloudflared container: {e}"
        logger.error(msg)
        return False, msg


def _fetch_cloudflared_logs(logs_cmd: list[str]) -> Tuple[int, str]:
    """Execute docker compose logs command synchronously in worker thread."""
    try:
        result = subprocess.run(
            logs_cmd,
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
        )
        combined = (result.stdout + "\n" + result.stderr).strip()
        return result.returncode, combined
    except subprocess.TimeoutExpired:
        return 1, "docker compose logs command timed out after 10s"
    except Exception as e:
        return 1, f"Failed to execute docker compose logs: {e}"


async def verify_cloudflared_health(timeout: float = 30.0, poll_interval: float = 2.0) -> Tuple[bool, str]:
    """
    Poll cloudflared logs (native or container) for registration confirmation.
    Returns (True, message) once connected, or (False, error_details) on timeout or explicit failure.
    """
    success_indicators = [
        "Registered tunnel connection",
        "Connection registered",
        "Connected to",
        "Updated to new configuration",
    ]
    failure_indicators = [
        "invalid tunnel token",
        "unauthorized",
        "tunnel credentials are invalid",
        "failed to create tunnel",
    ]

    loop = asyncio.get_event_loop()
    start_time = loop.time()
    last_output = ""

    # Branch A: Native subprocess verification
    if _native_tunnel_process is not None:
        while (loop.time() - start_time) < timeout:
            # Check if process exited unexpectedly
            retcode = _native_tunnel_process.poll()
            output = "\n".join(_native_tunnel_logs)
            last_output = output

            if retcode is not None and retcode != 0:
                msg = f"Native cloudflared exited with error code {retcode}: {output[-200:]}"
                logger.error(msg)
                return False, msg

            for indicator in success_indicators:
                if indicator.lower() in output.lower():
                    logger.info("Native tunnel connection confirmed: '%s'", indicator)
                    return True, "Tunnel registered successfully with Cloudflare edge"

            for indicator in failure_indicators:
                if indicator.lower() in output.lower():
                    msg = f"Cloudflared authentication failed: {indicator}"
                    logger.warning(msg)
                    return False, msg

            await asyncio.sleep(poll_interval)

        msg = f"Timed out waiting for native cloudflared tunnel registration after {int(timeout)}s"
        return False, msg

    # Branch B: Docker container verification
    cmd_prefix = _get_docker_compose_cmd()
    if not cmd_prefix:
        return False, "Docker command not found"

    logs_cmd = cmd_prefix + [
        "-f",
        str(DOCKER_COMPOSE_PATH),
        "--profile",
        "tunnel",
        "logs",
        "--tail",
        "60",
        "cloudflared",
    ]

    while (loop.time() - start_time) < timeout:
        try:
            returncode, output = await loop.run_in_executor(
                None,
                _fetch_cloudflared_logs,
                logs_cmd,
            )
            last_output = output

            for indicator in success_indicators:
                if indicator.lower() in output.lower():
                    logger.info("Tunnel connection confirmed in container logs: '%s'", indicator)
                    return True, "Tunnel registered successfully with Cloudflare edge"

            for indicator in failure_indicators:
                if indicator.lower() in output.lower():
                    msg = f"Cloudflared authentication failed: {indicator}"
                    logger.warning(msg)
                    return False, msg

        except Exception as e:
            logger.exception("Error checking cloudflared container logs: %r", e)

        await asyncio.sleep(poll_interval)

    msg = f"Timed out waiting for cloudflared tunnel registration after {int(timeout)}s"
    if last_output:
        logger.info("Last cloudflared output before timeout: %s", last_output[-200:])
    return False, msg


async def start_tunnel_workflow(token: str) -> None:
    """
    Asynchronous orchestrator for cloudflared tunnel lifecycle:
    1. Writes token to .env
    2. Updates state to 'starting'
    3. Prefers native cloudflared binary if found; falls back to Docker Compose
    4. Polls logs for connection confirmation
    5. Updates state to 'ready' or 'failed'
    """
    if not token:
        _update_state("unpaired", False, "Missing tunnel token")
        return

    _update_state("starting", False, None)

    # 1. Update .env files
    write_tunnel_token_to_env(token)

    loop = asyncio.get_event_loop()

    # 2. Check for native binary first
    if get_native_cloudflared_path() is not None:
        logger.info("Found native cloudflared binary, launching native process...")
        started, start_msg = await loop.run_in_executor(None, start_native_cloudflared, token)
    else:
        logger.info("No native cloudflared binary found, falling back to Docker compose...")
        started, start_msg = await loop.run_in_executor(None, start_cloudflared, token)

    if not started:
        _update_state("failed", False, start_msg)
        return

    # 3. Verify health
    verified, verify_msg = await verify_cloudflared_health(timeout=30.0, poll_interval=2.0)

    if verified:
        _update_state("ready", True, None)
        logger.info("Cloudflared tunnel is online and verified")
    else:
        _update_state("failed", False, verify_msg)
        logger.warning("Cloudflared tunnel could not be verified: %s", verify_msg)


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
            logger.info("Startup: Found persisted pairing credentials, starting cloudflared...")
            await start_tunnel_workflow(token)
        else:
            _update_state("unpaired", False, None)
    except Exception as e:
        logger.error("Failed to read pairing credentials on startup: %s", e)
        _update_state("unpaired", False, str(e))
