"""
Unit tests for runtime binary downloader and native process supervisor.
"""

import asyncio
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import MagicMock, patch
import pytest

from app.runtime.downloader import BinaryDownloader, ChecksumMismatchError, DownloadError
from app.runtime.manifest import BinarySpec, get_binary_spec, get_current_platform
from app.runtime.supervisor import (
    ProcessManager,
    ManagedProcess,
    PortConflictError,
    is_port_available,
)


def test_platform_detection():
    os_name, arch = get_current_platform()
    assert os_name in ("windows", "linux", "darwin")
    assert arch in ("amd64", "arm64")

    # MinIO spec lookup
    spec = get_binary_spec("minio", "windows", "amd64")
    assert spec.filename == "minio.exe"
    assert spec.name == "minio"
    assert len(spec.sha256) == 64

    # Cloudflared spec lookup
    cf_spec = get_binary_spec("cloudflared", "linux", "amd64")
    assert cf_spec.filename == "cloudflared"
    assert cf_spec.name == "cloudflared"
    assert len(cf_spec.sha256) == 64


def test_downloader_checksum_verification_and_skip(tmp_path):
    downloader = BinaryDownloader(bin_dir=tmp_path)

    # Create dummy binary content
    content = b"fake binary payload for testing"
    expected_hash = hashlib.sha256(content).hexdigest()

    test_file = tmp_path / "test_bin.exe"
    test_file.write_bytes(content)

    # Valid checksum check
    assert downloader.is_binary_valid(test_file, expected_hash) is True
    # Tampered checksum check
    assert downloader.is_binary_valid(test_file, "bad_hash_00000000000000000000000000000000000000000000000000000000") is False


def test_downloader_corrupt_binary_raises_checksum_error(tmp_path, monkeypatch):
    downloader = BinaryDownloader(bin_dir=tmp_path)

    fake_spec = BinarySpec(
        name="minio",
        version="v1",
        filename="corrupted_minio.exe",
        url="https://example.com/fake",
        sha256="expected_sha256_which_will_not_match",
    )
    monkeypatch.setattr("app.runtime.downloader.get_binary_spec", lambda name: fake_spec)

    # Mock urllib.request.urlopen returning dummy data
    class MockResponse:
        def __init__(self):
            self.headers = {"Content-Length": "10"}
            self.data = b"some bytes"
            self.read_called = False

        def read(self, size=65536):
            if not self.read_called:
                self.read_called = True
                return self.data
            return b""

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout=60: MockResponse())

    with pytest.raises(ChecksumMismatchError) as exc_info:
        downloader.ensure_binary("minio")

    assert "Checksum mismatch" in str(exc_info.value)
    # Ensure temp file was cleaned up
    assert not list(tmp_path.glob("*.tmp"))


def test_port_conflict_detection():
    # Test checking a known bound port (or bind one temporarily)
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        bound_port = s.getsockname()[1]
        # While bound, port is unavailable
        assert is_port_available(bound_port) is False

    # Once closed, port should be available
    assert is_port_available(bound_port) is True


def test_managed_process_lifecycle(tmp_path):
    log_file = tmp_path / "test_proc.log"
    # Use python executable with -u (unbuffered)
    cmd = [sys.executable, "-u", "-c", "import time; print('STARTED_OK', flush=True); time.sleep(10)"]

    managed = ManagedProcess(
        name="test_proc",
        cmd=cmd,
        env={"TEST_VAR": "hello"},
        cwd=tmp_path,
        log_file=log_file,
    )

    started, msg = managed.start()
    assert started is True
    assert managed.status == "running"
    assert managed.process is not None
    assert managed.process.poll() is None

    # Wait briefly for stdout log capture
    time.sleep(0.5)
    logs = managed.tail_logs()
    assert "STARTED_OK" in logs

    # Stop process
    stopped, s_msg = managed.stop(timeout=2.0)
    assert stopped is True
    assert managed.status == "stopped"
    assert managed.process.poll() is not None


@pytest.mark.asyncio
async def test_supervisor_crash_detection_and_backoff(tmp_path):
    pm = ProcessManager(data_dir=tmp_path)

    # Subprocess that exits immediately with code 1
    cmd = [sys.executable, "-u", "-c", "import sys; sys.exit(1)"]
    managed = pm.register(
        name="crashing_proc",
        cmd=cmd,
        env={},
        cwd=tmp_path,
    )
    managed.backoff_base = 0.05
    managed.max_restarts = 2

    # Start the process
    managed.start()

    # Run supervisor monitor loop with fast poll interval
    monitor_task = asyncio.create_task(pm.run_monitor_loop(poll_interval=0.05))
    await asyncio.sleep(0.5)
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass

    # Should have attempted restarts and marked as failed
    assert managed.restart_count >= 1
    pm.shutdown_all()


def test_process_manager_status_and_logs(tmp_path):
    pm = ProcessManager(data_dir=tmp_path)
    cmd = [sys.executable, "-u", "-c", "print('LOG_LINE_1', flush=True); print('LOG_LINE_2', flush=True); import time; time.sleep(5)"]
    pm.register("echo_proc", cmd=cmd, cwd=tmp_path)

    started, _ = pm.start("echo_proc", wait_ready=False)
    assert started is True

    time.sleep(0.5)
    status = pm.get_status("echo_proc")
    assert status["name"] == "echo_proc"
    assert status["status"] == "running"
    assert status["pid"] is not None

    logs = pm.tail_logs("echo_proc")
    assert "LOG_LINE_1" in logs

    pm.stop("echo_proc")
    assert pm.get_status("echo_proc")["status"] == "stopped"
