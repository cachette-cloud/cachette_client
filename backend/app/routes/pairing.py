import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import UserCache, DEFAULT_STORAGE_QUOTA_BYTES
from app.core.security import decode_token
from app.service.pairing_service import claim_node_pairing, get_pairing_credentials
from app.service.tunnel_service import (
    get_tunnel_status,
    is_tunnel_restart_in_progress,
    trigger_tunnel_restart,
)
from app.dependencies import (
    require_localhost,
    is_localhost,
    tunnel_restart_limiter,
    rate_limit,
    get_client_ip,
    get_current_node_user,
)

router = APIRouter(prefix="/node-pairing", tags=["node-pairing"])
session_router = APIRouter(prefix="/node-pairing", tags=["node-pairing"])


class PairingClaimRequest(BaseModel):
    pairing_code: str
    central_url: Optional[str] = None


@router.post("/claim", dependencies=[Depends(require_localhost)])
async def claim_pairing(body: PairingClaimRequest):
    """
    Trigger node pairing claim from central. Persists session_token, public_key,
    and bootstrap credentials locally, then triggers automated cloudflared startup.
    Accessible only via local host.
    """
    return await claim_node_pairing(
        pairing_code=body.pairing_code,
        central_url=body.central_url,
    )


@router.get("/status")
async def pairing_status(request: Request):
    """
    Check if node has persisted pairing credentials and report tunnel status.
    Non-local callers receive a sanitized subset of state: {paired, tunnel_ready}.
    """
    creds = get_pairing_credentials()
    tunnel = get_tunnel_status()
    from app.config import settings
    paired = bool(creds and creds.get("node_id") and (creds.get("public_key") or settings.PUBLIC_KEY))

    # Non-local callers receive only minimal, non-sensitive status
    if not is_localhost(request):
        return {
            "paired": paired,
            "tunnel_ready": True if paired else tunnel.get("ready", False),
        }

    if paired:
        return {
            "paired": True,
            "node_id": creds.get("node_id"),
            "subdomain": creds.get("subdomain"),
            "tunnel_status": tunnel.get("status", "unpaired"),
            "tunnel_ready": tunnel.get("ready", False),
            "tunnel_error": tunnel.get("error"),
            "tunnel_command": "Managed natively by Cachette supervisor",
        }
    return {
        "paired": False,
        "tunnel_status": tunnel.get("status", "unpaired"),
        "tunnel_ready": tunnel.get("ready", False),
        "tunnel_error": tunnel.get("error"),
        "tunnel_command": "Managed natively by Cachette supervisor",
    }


@session_router.get("/session")
async def get_node_session(
    request: Request,
    current_user: UserCache = Depends(get_current_node_user),
):
    """
    Return active node pairing session metadata and tunnel status.
    Requires verified node_access Bearer token.
    """
    creds = get_pairing_credentials()
    tunnel = get_tunnel_status()
    is_remote = not is_localhost(request)
    tunnel_ready = True if is_remote else tunnel.get("ready", False)
    tunnel_status = "ready" if tunnel_ready else tunnel.get("status", "unpaired")

    return {
        "paired": True,
        "node_id": creds.get("node_id") if creds else None,
        "subdomain": creds.get("subdomain") if creds else None,
        "user": {
            "user_id": str(current_user.user_id),
            "display_name": current_user.display_name,
            "role": getattr(current_user, "role", "member"),
            "storage_quota_bytes": current_user.storage_quota_bytes,
            "storage_used": current_user.storage_used,
        },
        "tunnel_status": tunnel_status,
        "tunnel_ready": tunnel_ready,
        "tunnel_error": tunnel.get("error"),
    }


@router.post(
    "/tunnel/restart",
    dependencies=[
        Depends(require_localhost),
        Depends(rate_limit(tunnel_restart_limiter, get_client_ip)),
    ],
)
async def restart_tunnel():
    """Manually retry or restart the cloudflared tunnel container."""
    creds = get_pairing_credentials()
    if not creds or not creds.get("cf_tunnel_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Node is not paired with a Cloudflare tunnel token",
        )

    if is_tunnel_restart_in_progress():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tunnel restart already in progress",
        )

    try:
        trigger_tunnel_restart(creds["cf_tunnel_token"])
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tunnel restart already in progress",
        )

    return {"status": "starting", "message": "Cloudflared tunnel restart triggered"}

