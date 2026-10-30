"""
Cachette Supervisor & Launcher
Manages native Windows background services (MinIO, FastAPI Backend, Cloudflared)
without requiring Docker, Python, or Node.js on the host.
"""

import os
import sys
import time
import signal
import logging
import subprocess
import webbrowser
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

# Configure logging under %LOCALAPPDATA%\Cachette\logs
LOG_DIR = Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "Cachette" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "cachette-launcher.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("cachette.launcher")

# Determine base application directory correctly whether frozen (PyInstaller) or running in development
if getattr(sys, "frozen", False):
    # PyInstaller executable: sys.executable points to Cachette.exe in the install directory
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    # Development: installer directory parent is project root
    _script_parent = Path(__file__).resolve().parent
    BASE_DIR = _script_parent.parent if (_script_parent.parent / "backend").exists() else _script_parent

PROJECT_ROOT = BASE_DIR
BIN_DIR = PROJECT_ROOT / "bin"
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"

DATA_DIR = Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "Cachette" / "data"
DB_DIR = Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "Cachette" / "db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_DIR.mkdir(parents=True, exist_ok=True)

# Process handles
_processes: list[subprocess.Popen] = []
_shutting_down = False


def _get_creation_flags() -> int:
    """Return flags to prevent command prompt windows on Windows."""
    if os.name == "nt":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def start_minio() -> subprocess.Popen | None:
    """Start standalone MinIO server."""
    minio_bin = BIN_DIR / ("minio.exe" if os.name == "nt" else "minio")
    if not minio_bin.is_file():
        import shutil
        found = shutil.which("minio")
        if found:
            minio_bin = Path(found)
        else:
            logger.warning("MinIO binary not found in %s or PATH", minio_bin)
            return None

    cmd = [
        str(minio_bin),
        "server",
        str(DATA_DIR),
        "--address",
        "127.0.0.1:9002",
        "--console-address",
        "127.0.0.1:9003",
    ]

    env = os.environ.copy()
    env["MINIO_ROOT_USER"] = "minioadmin"
    env["MINIO_ROOT_PASSWORD"] = "minioadmin"

    minio_log = open(LOG_DIR / "minio.log", "a", encoding="utf-8")
    logger.info("Starting MinIO server on 127.0.0.1:9002 (Data: %s)...", DATA_DIR)
    proc = subprocess.Popen(
        cmd,
        env=env,
        stdout=minio_log,
        stderr=subprocess.STDOUT,
        creationflags=_get_creation_flags(),
    )
    _processes.append(proc)
    return proc


def get_backend_command() -> tuple[list[str], Path]:
    """Find the correct backend command and working directory."""
    if not BACKEND_DIR.is_dir():
        raise NotADirectoryError(f"Backend directory not found at: {BACKEND_DIR}")

    # 1. Standalone compiled backend executable
    compiled_exe = BACKEND_DIR / ("cachette-backend.exe" if os.name == "nt" else "cachette-backend")
    if compiled_exe.is_file():
        logger.info("Using compiled backend executable: %s", compiled_exe)
        return [str(compiled_exe)], BACKEND_DIR

    # 2. Bundled virtualenv python in backend/.venv
    bundled_python_candidates = [
        BACKEND_DIR / ".venv" / "Scripts" / "pythonw.exe",
        BACKEND_DIR / ".venv" / "Scripts" / "python.exe",
        BACKEND_DIR / ".venv" / "bin" / "python",
    ]
    for candidate in bundled_python_candidates:
        if candidate.is_file():
            logger.info("Using bundled Python runtime: %s", candidate)
            return [
                str(candidate),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ], BACKEND_DIR

    # 3. System python fallback if running in development mode
    if not getattr(sys, "frozen", False):
        logger.info("Using active Python interpreter: %s", sys.executable)
        return [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ], BACKEND_DIR

    raise FileNotFoundError(f"Could not locate Python runtime or backend executable in: {BACKEND_DIR}")


def start_backend() -> subprocess.Popen | None:
    """Start FastAPI Backend."""
    cmd, cwd_path = get_backend_command()

    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_DIR.as_posix()}/cachette.db"
    env["S3_ENDPOINT_URL"] = "http://127.0.0.1:9002"
    env["AWS_ACCESS_KEY_ID"] = "minioadmin"
    env["AWS_SECRET_ACCESS_KEY"] = "minioadmin"
    env["AWS_REGION"] = "us-east-1"
    env["S3_BUCKET_NAME"] = "cachette-files"
    env["CENTRAL_URL"] = "https://cachette.cloud"
    env["CLOUDFLARED_BIN_PATH"] = str(BIN_DIR / ("cloudflared.exe" if os.name == "nt" else "cloudflared"))
    env["PYTHONPATH"] = str(cwd_path)

    backend_log = open(LOG_DIR / "backend.log", "a", encoding="utf-8")
    logger.info("Starting Backend server on 127.0.0.1:8000 (cwd: %s)...", cwd_path)

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd_path),
        env=env,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
        creationflags=_get_creation_flags(),
    )
    _processes.append(proc)
    return proc


def wait_for_backend(timeout_seconds: int = 20) -> bool:
    """Wait for backend health endpoint to respond."""
    import urllib.request
    start = time.time()
    url = "http://127.0.0.1:8000/health"

    while time.time() - start < timeout_seconds:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as response:
                if response.status == 200:
                    logger.info("Backend health check passed!")
                    return True
        except Exception:
            time.sleep(0.5)

    logger.warning("Backend health check timed out after %s seconds", timeout_seconds)
    return False


def stop_all_processes():
    """Cleanly terminate all managed child processes."""
    global _shutting_down
    if _shutting_down:
        return
    _shutting_down = True

    logger.info("Shutting down Cachette processes...")
    for proc in _processes:
        if proc.poll() is None:
            try:
                if psutil:
                    p = psutil.Process(proc.pid)
                    for child in p.children(recursive=True):
                        child.terminate()
                    p.terminate()
                else:
                    proc.terminate()
            except Exception as e:
                logger.error("Error terminating PID %s: %s", proc.pid, e)

    time.sleep(1.0)
    for proc in _processes:
        if proc.poll() is None:
            try:
                proc.kill()
            except Exception:
                pass
    logger.info("All processes stopped.")


def handle_signal(sig, frame):
    logger.info("Received termination signal %s", sig)
    stop_all_processes()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info("=== Starting Cachette Node Supervisor ===")
    logger.info("App Root: %s", PROJECT_ROOT)
    logger.info("Bin Directory: %s", BIN_DIR)
    logger.info("Backend Directory: %s", BACKEND_DIR)
    logger.info("Data Directory: %s", DATA_DIR)
    logger.info("Database Directory: %s", DB_DIR)
    logger.info("Logs Directory: %s", LOG_DIR)

    # 1. Start MinIO
    try:
        start_minio()
    except Exception as e:
        logger.error("Failed to start MinIO: %s", e)

    # 2. Start Backend
    try:
        start_backend()
    except Exception as e:
        logger.error("Failed to start Backend: %s", e)
        raise

    # 3. Wait for backend to be healthy and open browser
    if wait_for_backend(timeout_seconds=20):
        webbrowser.open("http://localhost:8000")
    else:
        logger.warning("Backend health check did not pass within timeout. Opening browser anyway...")
        webbrowser.open("http://localhost:8000")

    # 4. Supervise processes
    try:
        while not _shutting_down:
            time.sleep(2)
            for proc in _processes:
                ret = proc.poll()
                if ret is not None and not _shutting_down:
                    logger.warning("Managed process PID %s exited with code %s", proc.pid, ret)
    except KeyboardInterrupt:
        pass
    finally:
        stop_all_processes()


if __name__ == "__main__":
    main()
