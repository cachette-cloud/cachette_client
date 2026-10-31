"""
Process supervisor for native runtime subprocesses (MinIO and cloudflared).

Provides:
- Subprocess lifecycle management (start, stop, restart, status).
- Automatic crash recovery with exponential backoff.
- Rotating log capture for stdout/stderr.
- Readiness probes (HTTP health check for MinIO, connection logs for cloudflared).
- Clean termination and orphan prevention across Windows and Linux.
- Strict secret isolation (credentials in environment variables only).
"""

import asyncio
import atexit
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import platform
import socket
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
import urllib.request
import psutil

logger = logging.getLogger("cachette.runtime.supervisor")


class ProcessSupervisorError(Exception):
    """Base error for runtime process supervisor."""
    pass


class PortConflictError(ProcessSupervisorError):
    """Raised when a required local port is already bound."""
    pass


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a TCP port is free to bind."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.bind((host, port))
            return True
        except (OSError, socket.error):
            return False


class ManagedProcess:
    """Represents a single supervised native subprocess."""

    def __init__(
        self,
        name: str,
        cmd: List[str],
        env: Dict[str, str],
        cwd: Path,
        log_file: Path,
        readiness_check: Optional[Callable[[], Tuple[bool, str]]] = None,
        max_restarts: int = 5,
        backoff_base: float = 1.0,
        backoff_max: float = 30.0,
    ):
        self.name = name
        self.cmd = cmd
        self.env = env
        self.cwd = cwd
        self.log_file = log_file
        self.readiness_check = readiness_check
        self.max_restarts = max_restarts
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max

        self.process: Optional[subprocess.Popen] = None
        self.status: str = "stopped"  # stopped, starting, running, crashed, failed
        self.error: Optional[str] = None
        self.restart_count: int = 0
        self.last_start_time: float = 0.0
        self.current_backoff: float = backoff_base
        self.should_run: bool = False

        self._log_handler: Optional[RotatingFileHandler] = None
        self._pipe_threads: List[threading.Thread] = []
        self._monitor_task: Optional[asyncio.Task] = None
        self._lock = threading.Lock()

    def _setup_logger(self) -> None:
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        self._log_handler = RotatingFileHandler(
            str(self.log_file),
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=3,
            encoding="utf-8",
        )
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        self._log_handler.setFormatter(formatter)

    def _log_line(self, line: str) -> None:
        if self._log_handler and line.strip():
            record = logging.LogRecord(
                name=self.name,
                level=logging.INFO,
                pathname="",
                lineno=0,
                msg=line.strip(),
                args=(),
                exc_info=None,
            )
            self._log_handler.emit(record)
            self._log_handler.flush()

    def _read_pipe(self, pipe) -> None:
        try:
            for line in iter(pipe.readline, ""):
                if not line:
                    break
                self._log_line(line)
        except Exception:
            pass
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    def start(self) -> Tuple[bool, str]:
        """Launch the managed process with hidden console flags and isolated session."""
        with self._lock:
            if self.process and self.process.poll() is None:
                return True, f"{self.name} is already running"

            self._setup_logger()
            self.status = "starting"
            self.error = None
            self.should_run = True
            self.last_start_time = time.time()

            merged_env = os.environ.copy()
            merged_env.update(self.env)

            # Platform-specific isolation flags
            kwargs: Dict[str, Any] = {
                "cwd": str(self.cwd),
                "env": merged_env,
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "text": True,
                "bufsize": 1,
            }

            if platform.system().lower() == "windows":
                # CREATE_NO_WINDOW (0x08000000) + CREATE_NEW_PROCESS_GROUP (0x00000200)
                kwargs["creationflags"] = 0x08000000 | 0x00000200
            else:
                kwargs["preexec_fn"] = os.setsid

            try:
                logger.info(f"Spawning native process: {self.name} ({self.cmd[0]})")
                self.process = subprocess.Popen(self.cmd, **kwargs)

                # Start background log streaming threads
                t_out = threading.Thread(target=self._read_pipe, args=(self.process.stdout,), daemon=True)
                t_err = threading.Thread(target=self._read_pipe, args=(self.process.stderr,), daemon=True)
                t_out.start()
                t_err.start()
                self._pipe_threads = [t_out, t_err]

                self.status = "running"
                return True, f"{self.name} started (PID: {self.process.pid})"

            except Exception as e:
                self.status = "failed"
                self.error = str(e)
                logger.error(f"Failed to spawn {self.name}: {e}")
                return False, f"Failed to start {self.name}: {e}"

    def wait_ready(self, timeout: float = 15.0, poll_interval: float = 0.5) -> Tuple[bool, str]:
        """Poll readiness check until ready or timeout."""
        if not self.readiness_check:
            return True, f"{self.name} has no readiness check defined"

        start_t = time.time()
        while time.time() - start_t < timeout:
            if self.process and self.process.poll() is not None:
                exit_code = self.process.poll()
                return False, f"{self.name} exited prematurely with return code {exit_code}"

            try:
                is_ready, msg = self.readiness_check()
                if is_ready:
                    self.status = "ready"
                    return True, msg
            except Exception as e:
                pass

            time.sleep(poll_interval)

        return False, f"Timed out waiting for {self.name} readiness ({timeout}s)"

    def stop(self, timeout: float = 5.0) -> Tuple[bool, str]:
        """Gracefully terminate process and all child processes."""
        with self._lock:
            self.should_run = False
            if not self.process or self.process.poll() is not None:
                self.status = "stopped"
                return True, f"{self.name} is already stopped"

            pid = self.process.pid
            logger.info(f"Stopping managed process: {self.name} (PID: {pid})...")

            try:
                parent = psutil.Process(pid)
                children = parent.children(recursive=True)

                # Send SIGTERM / terminate
                parent.terminate()
                for c in children:
                    try:
                        c.terminate()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                # Wait for exit
                _, alive = psutil.wait_procs([parent] + children, timeout=timeout)

                # Force kill if still alive
                if alive:
                    logger.warning(f"Process {self.name} did not exit after {timeout}s; killing...")
                    for p in alive:
                        try:
                            p.kill()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass

            except (psutil.NoSuchProcess, ProcessLookupError):
                pass
            except Exception as e:
                logger.error(f"Error while terminating {self.name}: {e}")
                try:
                    self.process.kill()
                except Exception:
                    pass

            self.status = "stopped"
            return True, f"{self.name} stopped"

    def tail_logs(self, lines: int = 100) -> str:
        """Return the last N lines of the managed process log."""
        if not self.log_file.exists():
            return ""
        try:
            with open(self.log_file, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
                return "".join(all_lines[-lines:])
        except Exception as e:
            return f"Failed to read logs: {e}"

    def get_status(self) -> Dict[str, Any]:
        """Return current status dictionary."""
        pid = self.process.pid if self.process and self.process.poll() is None else None
        return {
            "name": self.name,
            "status": self.status,
            "pid": pid,
            "restart_count": self.restart_count,
            "error": self.error,
            "log_file": str(self.log_file),
        }


class ProcessManager:
    """Orchestrates all managed subprocesses, auto-restarts, and clean shutdown."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.bin_dir = data_dir / "bin"
        self.logs_dir = data_dir / "logs"
        self.minio_dir = data_dir / "minio"

        for d in (self.bin_dir, self.logs_dir, self.minio_dir):
            d.mkdir(parents=True, exist_ok=True)

        self.processes: Dict[str, ManagedProcess] = {}
        self._monitor_task: Optional[asyncio.Task] = None
        self._running = False

        atexit.register(self.shutdown_all)

    def register(
        self,
        name: str,
        cmd: List[str],
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[Path] = None,
        readiness_check: Optional[Callable[[], Tuple[bool, str]]] = None,
    ) -> ManagedProcess:
        """Register a new managed process definition."""
        log_file = self.logs_dir / f"{name}.log"
        managed = ManagedProcess(
            name=name,
            cmd=cmd,
            env=env or {},
            cwd=cwd or self.data_dir,
            log_file=log_file,
            readiness_check=readiness_check,
        )
        self.processes[name] = managed
        return managed

    def start(self, name: str, wait_ready: bool = True, timeout: float = 15.0) -> Tuple[bool, str]:
        """Start a managed process by name."""
        if name not in self.processes:
            return False, f"Unknown process: {name}"

        managed = self.processes[name]
        started, msg = managed.start()
        if not started:
            return False, msg

        if wait_ready and managed.readiness_check:
            ready, r_msg = managed.wait_ready(timeout=timeout)
            if not ready:
                managed.stop()
                return False, f"{name} failed readiness check: {r_msg}"
            return True, f"{name} started and verified ready"

        return True, msg

    def stop(self, name: str, timeout: float = 5.0) -> Tuple[bool, str]:
        """Stop a managed process by name."""
        if name not in self.processes:
            return False, f"Unknown process: {name}"
        return self.processes[name].stop(timeout=timeout)

    def restart(self, name: str, wait_ready: bool = True) -> Tuple[bool, str]:
        """Restart a managed process by name."""
        self.stop(name)
        return self.start(name, wait_ready=wait_ready)

    def get_status(self, name: Optional[str] = None) -> Dict[str, Any]:
        """Get status of a specific process or all registered processes."""
        if name:
            if name not in self.processes:
                return {"error": f"Unknown process: {name}"}
            return self.processes[name].get_status()

        return {k: p.get_status() for k, p in self.processes.items()}

    def tail_logs(self, name: str, lines: int = 100) -> str:
        """Tail logs of a managed process."""
        if name not in self.processes:
            return ""
        return self.processes[name].tail_logs(lines=lines)

    async def run_monitor_loop(self, poll_interval: float = 0.5) -> None:
        """Background task monitoring process health and auto-restarting on unexpected crashes."""
        self._running = True
        logger.info("ProcessManager supervisor monitor loop started.")
        while self._running:
            try:
                now = time.time()
                for name, managed in list(self.processes.items()):
                    if not managed.should_run:
                        continue

                    if managed.process and managed.process.poll() is not None:
                        exit_code = managed.process.poll()
                        managed.status = "crashed"
                        logger.warning(
                            f"Managed process '{name}' exited unexpectedly with code {exit_code}. "
                            f"(Restart count: {managed.restart_count}, Next backoff: {managed.current_backoff:.1f}s)"
                        )

                        # Reset backoff if ran healthy for > 60 seconds
                        if now - managed.last_start_time > 60.0:
                            managed.current_backoff = managed.backoff_base

                        if managed.restart_count < managed.max_restarts:
                            managed.restart_count += 1
                            await asyncio.sleep(managed.current_backoff)
                            managed.current_backoff = min(managed.current_backoff * 2.0, managed.backoff_max)

                            logger.info(f"Attempting restart {managed.restart_count}/{managed.max_restarts} for {name}...")
                            managed.start()
                            if managed.readiness_check:
                                loop = asyncio.get_event_loop()
                                ready, _ = await loop.run_in_executor(None, managed.wait_ready, 10.0)
                                if ready:
                                    logger.info(f"Process '{name}' successfully recovered.")
                        else:
                            managed.status = "failed"
                            managed.error = f"Exceeded maximum restarts ({managed.max_restarts})"
                            logger.error(f"Process '{name}' failed permanently: max restarts reached.")

                await asyncio.sleep(poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in ProcessManager monitor loop: {e}")
                await asyncio.sleep(poll_interval)

    def shutdown_all(self) -> None:
        """Stop all managed subprocesses cleanly."""
        self._running = False
        for name, managed in list(self.processes.items()):
            try:
                managed.stop(timeout=3.0)
            except Exception as e:
                logger.error(f"Error stopping {name} during shutdown: {e}")
