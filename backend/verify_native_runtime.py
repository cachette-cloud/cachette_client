"""
End-to-end integration verification for native MinIO & cloudflared supervisor.

Validates:
1. Native MinIO starts and passes health readiness.
2. File upload and download works directly through S3Service against native MinIO.
3. Process crash detection & automatic restart recovery.
4. Clean shutdown with zero orphan processes left behind.
5. Checksum corruption detection and rejection.
"""

import asyncio
import hashlib
import os
from pathlib import Path
import platform
import socket
import sys
import time
import psutil

from app.config import settings
from app.runtime.downloader import BinaryDownloader, ChecksumMismatchError
from app.runtime.manifest import get_binary_spec
from app.runtime.supervisor import ProcessManager, PortConflictError, is_port_available
from app.runtime.service_setup import setup_minio, setup_cloudflared
from app.service.s3_service import S3Service


async def test_native_runtime():
    print("=" * 65)
    print("STARTING NATIVE RUNTIME & SUPERVISOR VERIFICATION (ZERO DOCKER)")
    print("=" * 65)

    data_dir = Path(settings.CACHETTE_DATA_DIR)
    bin_dir = data_dir / "bin"
    pm = ProcessManager(data_dir=data_dir)
    downloader = BinaryDownloader(bin_dir=bin_dir)

    # -------------------------------------------------------------
    # 1. Verify MinIO Binary Existence & Checksum
    # -------------------------------------------------------------
    print("\n[Step 1] Validating native MinIO binary...")
    spec = get_binary_spec("minio")
    minio_path = bin_dir / spec.filename

    assert minio_path.exists(), f"MinIO binary not found at {minio_path}"
    actual_hash = downloader.compute_sha256(minio_path)
    assert actual_hash.lower() == spec.sha256.lower(), f"MinIO hash mismatch: {actual_hash} != {spec.sha256}"
    print(f"[PASS] MinIO binary verified: {minio_path} (SHA256: {actual_hash[:16]}...)")

    # -------------------------------------------------------------
    # 2. Port Conflict Detection
    # -------------------------------------------------------------
    print("\n[Step 2] Testing port conflict detection...")
    dummy_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    dummy_socket.bind(("127.0.0.1", settings.MINIO_PORT))
    dummy_socket.listen(1)

    port_conflict_caught = False
    try:
        setup_minio(pm, downloader)
    except PortConflictError as e:
        port_conflict_caught = True
        print(f"[PASS] Port conflict detected and blocked cleanly: {e}")
    finally:
        dummy_socket.close()
        time.sleep(0.2)

    assert port_conflict_caught, "Failed to detect port conflict on MinIO port!"

    # -------------------------------------------------------------
    # 3. Native MinIO Lifecycle & Health Readiness Probe
    # -------------------------------------------------------------
    print("\n[Step 3] Spawning native MinIO process via supervisor...")
    setup_minio(pm, downloader)
    started, msg = pm.start("minio", wait_ready=True, timeout=15.0)
    assert started is True, f"MinIO start failed: {msg}"

    minio_proc = pm.processes["minio"]
    minio_pid = minio_proc.process.pid
    print(f"[PASS] MinIO native server online (PID: {minio_pid})")
    assert minio_proc.status in ("running", "ready")
    assert psutil.pid_exists(minio_pid)

    # -------------------------------------------------------------
    # 4. File Upload & Download through S3Service against native MinIO
    # -------------------------------------------------------------
    print("\n[Step 4] Testing S3 file upload/download against native MinIO...")
    s3 = S3Service()
    await s3.ensure_bucket_exists()
    print(f"[PASS] S3 bucket '{settings.S3_BUCKET_NAME}' verified on native MinIO.")

    test_key = "integration_test_file.txt"
    test_data = b"Native MinIO without Docker test content: " + os.urandom(1024)

    async with s3._client() as client:
        # Put object
        await client.put_object(Bucket=s3.bucket, Key=test_key, Body=test_data)
        print(f"[PASS] Uploaded 1KB test object to s3://{s3.bucket}/{test_key}")

        # Get object
        resp = await client.get_object(Bucket=s3.bucket, Key=test_key)
        downloaded = await resp["Body"].read()
        assert downloaded == test_data, "Downloaded file content does not match uploaded content!"
        print(f"[PASS] Downloaded and verified object integrity.")

        # Delete object
        await client.delete_object(Bucket=s3.bucket, Key=test_key)
        print(f"[PASS] Cleaned up test object.")

    # -------------------------------------------------------------
    # 5. Native Subprocess Crash Detection & Auto-Restart Recovery
    # -------------------------------------------------------------
    print("\n[Step 5] Testing crash detection and auto-restart...")
    # Start supervisor monitor loop
    monitor_task = asyncio.create_task(pm.run_monitor_loop(poll_interval=0.1))

    # Manually terminate MinIO process to simulate a sudden crash
    print(f"  Killing MinIO (PID: {minio_pid}) to simulate unexpected crash...")
    p = psutil.Process(minio_pid)
    p.kill()

    # Wait for supervisor to detect exit, apply backoff, and restart
    await asyncio.sleep(2.0)

    new_minio_proc = pm.processes["minio"]
    new_pid = new_minio_proc.process.pid if new_minio_proc.process else None
    assert new_minio_proc.restart_count >= 1, "Supervisor failed to increment restart count"
    assert new_pid is not None and new_pid != minio_pid, "Supervisor failed to spawn new process"
    assert psutil.pid_exists(new_pid), "Recovered process PID does not exist"
    print(f"[PASS] MinIO auto-restart succeeded! New PID: {new_pid} (Restart count: {new_minio_proc.restart_count})")

    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass

    # -------------------------------------------------------------
    # 6. Clean Shutdown & Orphan Process Verification
    # -------------------------------------------------------------
    print("\n[Step 6] Testing clean shutdown & orphan prevention...")
    active_pid = new_pid
    pm.shutdown_all()
    time.sleep(1.0)

    assert not psutil.pid_exists(active_pid), f"Orphan process detected! PID {active_pid} still running."
    print(f"[PASS] MinIO process {active_pid} cleanly stopped. Zero orphan processes remain.")

    # -------------------------------------------------------------
    # 7. Corrupted Binary Checksum Rejection Test
    # -------------------------------------------------------------
    print("\n[Step 7] Testing corrupted binary detection and rejection...")
    corrupt_bin_path = bin_dir / "corrupt_test.exe"
    corrupt_bin_path.write_bytes(b"corrupted binary data")

    expected_fake_hash = "0" * 64
    assert not downloader.is_binary_valid(corrupt_bin_path, expected_fake_hash)
    corrupt_bin_path.unlink()
    print("[PASS] Checksum mismatch successfully detected.")

    print("\n" + "=" * 65)
    print("ALL NATIVE RUNTIME & SUPERVISOR VERIFICATIONS PASSED!")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(test_native_runtime())

