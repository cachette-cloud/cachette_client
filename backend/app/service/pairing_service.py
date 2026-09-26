import asyncio
import json
import logging
from typing import Any, Dict, Optional
import httpx
from fastapi import HTTPException, status

from app.config import settings, PAIRING_CREDENTIALS_PATH, PUBLIC_PEM_PATH

logger = logging.getLogger("cachette.pairing")


def persist_pairing_credentials(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Persist session_token, session_token_expires_at, and public_key from central's
    /node-pairing/claim response into local storage and update settings.PUBLIC_KEY in memory.
    """
    session_token = data.get("session_token")
    session_token_expires_at = data.get("session_token_expires_at")
    public_key = data.get("public_key")

    credentials = {
        "session_token": session_token,
        "session_token_expires_at": str(session_token_expires_at) if session_token_expires_at else None,
        "public_key": public_key,
        "node_id": str(data.get("node_id")) if data.get("node_id") else None,
        "cf_tunnel_token": data.get("cf_tunnel_token"),
        "subdomain": data.get("subdomain"),
    }

    # Save to JSON storage
    PAIRING_CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PAIRING_CREDENTIALS_PATH, "w", encoding="utf-8") as f:
        json.dump(credentials, f, indent=2)

    # Save public.pem if key is present
    if public_key:
        with open(PUBLIC_PEM_PATH, "w", encoding="utf-8") as f:
            f.write(public_key.strip() + "\n")
        # Update settings in memory so token verification immediately uses the key
        settings.PUBLIC_KEY = public_key

    logger.info("Persisted pairing credentials and public key to local storage")
    return credentials


def get_pairing_credentials() -> Optional[Dict[str, Any]]:
    """Retrieve persisted pairing credentials from local storage."""
    if not PAIRING_CREDENTIALS_PATH.exists():
        return None
    try:
        with open(PAIRING_CREDENTIALS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to read pairing credentials file: %s", e)
        return None


async def claim_node_pairing(pairing_code: str, central_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Call central's /node-pairing/claim endpoint to exchange a pairing code
    for session_token, public_key, and Cloudflare credentials.
    """
    base_url = (central_url or settings.CENTRAL_URL).rstrip("/")
    claim_endpoint = f"{base_url}/api/v1/node-pairing/claim"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(claim_endpoint, json={"pairing_code": pairing_code})
        except httpx.RequestError as e:
            logger.error("Failed to reach central pairing service: %s", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Unable to connect to central server at {base_url}",
            )

    if response.status_code != 200:
        logger.warning("Pairing claim rejected by central: %s", response.text)
        try:
            detail = response.json().get("detail", "Failed to claim pairing code from central")
        except Exception:
            detail = f"Central returned non-JSON response (status {response.status_code}): {response.text[:200]}"
        raise HTTPException(
            status_code=response.status_code,
            detail=detail,
        )

    try:
        data = response.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Central returned non-JSON response on success: {response.text[:200]}",
        )
    persisted = persist_pairing_credentials(data)

    # Automatically launch cloudflared tunnel in background
    cf_token = persisted.get("cf_tunnel_token")
    if cf_token:
        try:
            from app.service.tunnel_service import start_tunnel_workflow
            asyncio.create_task(start_tunnel_workflow(cf_token))
        except Exception as e:
            logger.error("Failed to schedule cloudflared tunnel startup: %s", e)

    return {
        "status": "paired",
        "node_id": persisted.get("node_id"),
        "session_token_expires_at": persisted.get("session_token_expires_at"),
        "subdomain": persisted.get("subdomain"),
    }
