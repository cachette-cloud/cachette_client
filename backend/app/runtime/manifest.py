"""
Pinned release manifest for native runtime binaries (MinIO and cloudflared).

Provides download URLs, target binary names, and SHA256 checksums per OS and architecture.
"""

from dataclasses import dataclass
import platform
import sys
from typing import Dict, Tuple


@dataclass(frozen=True)
class BinarySpec:
    name: str
    version: str
    filename: str
    url: str
    sha256: str


# Pinned releases
MINIO_VERSION = "RELEASE.2025-06-13T11-33-47Z"
CLOUDFLARED_VERSION = "2026.10.7"

# (binary_name, os, arch) -> BinarySpec
MANIFEST: Dict[Tuple[str, str, str], BinarySpec] = {
    # MinIO
    ("minio", "windows", "amd64"): BinarySpec(
        name="minio",
        version=MINIO_VERSION,
        filename="minio.exe",
        url=f"https://github.com/minio/minio/releases/download/{MINIO_VERSION}/minio.windows-amd64.{MINIO_VERSION}.exe",
        sha256="ef7f328339d931adbc9c06155bce92102b12be455c63f38235b7af86db4d0163",
    ),
    ("minio", "linux", "amd64"): BinarySpec(
        name="minio",
        version=MINIO_VERSION,
        filename="minio",
        url=f"https://github.com/minio/minio/releases/download/{MINIO_VERSION}/minio.linux-amd64.{MINIO_VERSION}",
        sha256="668d3fa0334da86a481da79cc88740f751bf60d8cf15ff988f4bceafa22ca4b0",
    ),
    ("minio", "linux", "arm64"): BinarySpec(
        name="minio",
        version=MINIO_VERSION,
        filename="minio",
        url=f"https://github.com/minio/minio/releases/download/{MINIO_VERSION}/minio.linux-arm64.{MINIO_VERSION}",
        sha256="61262e156433fd1d353accc8bc008bd236efb023bd878f13df2fdb285c0e026f",
    ),
    # Cloudflared
    ("cloudflared", "windows", "amd64"): BinarySpec(
        name="cloudflared",
        version=CLOUDFLARED_VERSION,
        filename="cloudflared.exe",
        url=f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe",
        sha256="2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343",
    ),
    ("cloudflared", "linux", "amd64"): BinarySpec(
        name="cloudflared",
        version=CLOUDFLARED_VERSION,
        filename="cloudflared",
        url=f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64",
        sha256="1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872",
    ),
    ("cloudflared", "linux", "arm64"): BinarySpec(
        name="cloudflared",
        version=CLOUDFLARED_VERSION,
        filename="cloudflared",
        url=f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-arm64",
        sha256="3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775",
    ),
}


def get_current_platform() -> Tuple[str, str]:
    """Detect normalized current OS and architecture."""
    os_name = platform.system().lower()
    if os_name.startswith("win"):
        os_name = "windows"
    elif os_name.startswith("linux"):
        os_name = "linux"
    elif os_name.startswith("darwin"):
        os_name = "darwin"

    arch = platform.machine().lower()
    if arch in ("x86_64", "amd64"):
        arch = "amd64"
    elif arch in ("aarch64", "arm64"):
        arch = "arm64"

    return os_name, arch


def get_binary_spec(binary_name: str, os_name: str | None = None, arch: str | None = None) -> BinarySpec:
    """Look up binary spec for current or specified platform."""
    current_os, current_arch = get_current_platform()
    target_os = os_name or current_os
    target_arch = arch or current_arch

    key = (binary_name.lower(), target_os, target_arch)
    if key not in MANIFEST:
        raise ValueError(f"No binary specification found for {binary_name} on {target_os}-{target_arch}")

    return MANIFEST[key]

