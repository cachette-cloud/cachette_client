"""
Runtime subsystem for managing native binaries and subprocesses.
"""

from pathlib import Path
from app.config import settings
from app.runtime.downloader import BinaryDownloader, ChecksumMismatchError, DownloadError
from app.runtime.manifest import get_binary_spec
from app.runtime.supervisor import (
    ProcessManager,
    ManagedProcess,
    PortConflictError,
    ProcessSupervisorError,
    is_port_available,
)

_process_manager: ProcessManager | None = None


def get_process_manager() -> ProcessManager:
    """Return the global ProcessManager instance configured with app settings."""
    global _process_manager
    if _process_manager is None:
        data_dir = Path(settings.CACHETTE_DATA_DIR)
        _process_manager = ProcessManager(data_dir=data_dir)
    return _process_manager

