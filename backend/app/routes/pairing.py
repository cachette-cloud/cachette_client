import uuid
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import UserCache, DEFAULT_STORAGE_QUOTA_BYTES
from app.core.security import decode_token
from app.service.pairing_service import claim_node_pairing, get_pairing_credentials
from app.service.tunnel_service import get_tunnel_status, start_tunnel_workflow
import asyncio
from fastapi import HTTPException, status

router = APIRouter(prefix="/node-pairing", tags=["node-pairing"])


class PairingClaimRequest(BaseModel):
    pairing_code: str
    central_url: Optional[str] = None


@router.post("/claim")
async def claim_pairing(body: PairingClaimRequest):
    """
    Trigger node pairing claim from central. Persists session_token, public_key,
    and bootstrap credentials locally, then triggers automated cloudflared startup.
    """
    return await claim_node_pairing(
        pairing_code=body.pairing_code,
        central_url=body.central_url,
    )


@router.get("/status")
async def pairing_status():
    """Check if node has persisted pairing credentials and report tunnel status."""
    creds = get_pairing_credentials()
    tunnel = get_tunnel_status()
    if creds and creds.get("public_key") and creds.get("session_token"):
        return {
            "paired": True,
            "node_id": creds.get("node_id"),
            "subdomain": creds.get("subdomain"),
            "session_token_expires_at": creds.get("session_token_expires_at"),
            "tunnel_status": tunnel.get("status", "unpaired"),
            "tunnel_ready": tunnel.get("ready", False),
            "tunnel_error": tunnel.get("error"),
        }
    return {
        "paired": False,
        "tunnel_status": "unpaired",
        "tunnel_ready": False,
        "tunnel_error": None,
    }


@router.get("/session")
async def get_node_session(db: AsyncSession = Depends(get_db)):
    """
    Return the active node pairing session, including the session_token,
    expiration, read-only UserCache details, and cloudflared tunnel lifecycle status.
    """
    creds = get_pairing_credentials()
    tunnel = get_tunnel_status()
    if not creds or not creds.get("public_key") or not creds.get("session_token"):
        return {
            "paired": False,
            "tunnel_status": "unpaired",
            "tunnel_ready": False,
            "tunnel_error": None,
        }

    session_token = creds.get("session_token")
    user_data = None

    payload = decode_token(session_token) if session_token else None
    if payload and payload.get("sub"):
        try:
            user_uuid = uuid.UUID(str(payload["sub"]))
            user = await db.get(UserCache, user_uuid)
            if not user:
                user = UserCache(
                    user_id=user_uuid,
                    display_name=payload.get("display_name") or payload.get("name") or "Node Owner",
                    storage_quota_bytes=DEFAULT_STORAGE_QUOTA_BYTES,
                    storage_used=0,
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)

            user_data = {
                "user_id": str(user.user_id),
                "display_name": user.display_name,
                "storage_quota_bytes": user.storage_quota_bytes,
                "storage_used": user.storage_used,
            }
        except Exception:
            pass

    return {
        "paired": True,
        "node_id": creds.get("node_id"),
        "subdomain": creds.get("subdomain"),
        "session_token": session_token,
        "session_token_expires_at": creds.get("session_token_expires_at"),
        "user": user_data,
        "tunnel_status": tunnel.get("status", "unpaired"),
        "tunnel_ready": tunnel.get("ready", False),
        "tunnel_error": tunnel.get("error"),
    }


@router.post("/tunnel/restart")
async def restart_tunnel():
    """Manually retry or restart the cloudflared tunnel container."""
    creds = get_pairing_credentials()
    if not creds or not creds.get("cf_tunnel_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Node is not paired with a Cloudflare tunnel token",
        )
    asyncio.create_task(start_tunnel_workflow(creds["cf_tunnel_token"]))
    return {"status": "starting", "message": "Cloudflared tunnel restart triggered"}
