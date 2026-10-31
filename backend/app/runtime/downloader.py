"""
Atomic, verifiable binary downloader for MinIO and cloudflared.
"""

import hashlib
import logging
import os
from pathlib import Path
import stat
import urllib.request
from typing import Callable, Optional

from app.runtime.manifest import BinarySpec, get_binary_spec

logger = logging.getLogger("cachette.runtime.downloader")


class DownloadError(Exception):
    """Base error for binary download failures."""
    pass


class ChecksumMismatchError(DownloadError):
    """Raised when downloaded binary does not match pinned SHA256 checksum."""
    pass


class BinaryDownloader:
    """Manages downloading, verifying, and caching native executable binaries."""

    def __init__(self, bin_dir: Path):
        self.bin_dir = bin_dir
        self.bin_dir.mkdir(parents=True, exist_ok=True)

    def compute_sha256(self, file_path: Path, chunk_size: int = 65536) -> str:
        """Compute the SHA256 hex digest of a local file."""
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(chunk_size):
                hasher.update(chunk)
        return hasher.hexdigest().lower()

    def is_binary_valid(self, file_path: Path, expected_sha256: str) -> bool:
        """Check if binary exists and has matching SHA256."""
        if not file_path.exists() or not file_path.is_file():
            return False
        actual = self.compute_sha256(file_path)
        return actual.lower() == expected_sha256.lower()

    def ensure_binary(
        self,
        binary_name: str,
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> Path:
        """
        Ensure the requested binary is downloaded and verified in bin_dir.
        
        Returns the absolute path to the executable binary.
        Raises ChecksumMismatchError or DownloadError on failure.
        """
        spec = get_binary_spec(binary_name)
        target_path = self.bin_dir / spec.filename

        # If already downloaded and checksum is valid, return immediately
        if target_path.exists():
            if self.is_binary_valid(target_path, spec.sha256):
                logger.debug(f"Binary '{spec.name}' is already up-to-date at {target_path}")
                return target_path
            else:
                logger.warning(f"Existing binary at {target_path} failed checksum check. Re-downloading...")
                try:
                    target_path.unlink()
                except Exception:
                    pass

        # Atomic download via temp file
        temp_path = self.bin_dir / f"{spec.filename}.{os.getpid()}.tmp"
        if temp_path.exists():
            temp_path.unlink()

        logger.info(f"Downloading {spec.name} ({spec.version}) from {spec.url}...")
        hasher = hashlib.sha256()
        downloaded_bytes = 0

        req = urllib.request.Request(
            spec.url,
            headers={"User-Agent": "Cachette-Node-Installer/1.0"},
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                total_bytes = int(resp.headers.get("Content-Length", 0))
                with open(temp_path, "wb") as f:
                    while chunk := resp.read(65536):
                        f.write(chunk)
                        hasher.update(chunk)
                        downloaded_bytes += len(chunk)
                        if progress_callback:
                            progress_callback(downloaded_bytes, total_bytes)

            actual_sha256 = hasher.hexdigest().lower()
            expected_sha256 = spec.sha256.lower()

            if actual_sha256 != expected_sha256:
                if temp_path.exists():
                    temp_path.unlink()
                raise ChecksumMismatchError(
                    f"Checksum mismatch for {spec.name} ({spec.filename})!\n"
                    f"  Expected: {expected_sha256}\n"
                    f"  Actual:   {actual_sha256}"
                )

            # Make executable on Unix
            if os.name != "nt":
                current_mode = os.stat(temp_path).st_mode
                os.chmod(temp_path, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

            # Atomic rename into final location
            if target_path.exists():
                target_path.unlink()
            temp_path.rename(target_path)
            logger.info(f"Successfully installed and verified {spec.name} at {target_path}")
            return target_path

        except Exception as e:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            if isinstance(e, ChecksumMismatchError):
                raise
            raise DownloadError(f"Failed to download {spec.name} from {spec.url}: {e}") from e

