import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
import httpx
from jose import jwt, jwk, JWTError

from app.config import settings

logger = logging.getLogger("cachette.jwks")


class JWKSManager:
    """
    Fetches, in-memory caches, and periodically refreshes Central's RS256 public keys from JWKS.
    Supports on-demand refresh when verification fails to handle Central key rotation seamlessly.
    """

    def __init__(self, jwks_url: Optional[str] = None):
        self.jwks_url = jwks_url or settings.CENTRAL_JWKS_URL
        self._keys_by_kid: Dict[str, str] = {}
        self._all_pems: List[str] = []
        self._last_fetched: float = 0.0
        self._lock = asyncio.Lock()

    async def fetch_keys(self, force: bool = False) -> bool:
        """Fetch JWKS keys from Central and cache them in memory as PEM strings."""
        now = time.time()
        # Cooldown guard: do not spam Central if called repeatedly within 5 seconds
        if not force and (now - self._last_fetched) < 60.0:
            return True
        if force and (now - self._last_fetched) < 5.0:
            return False

        async with self._lock:
            try:
                url = self.jwks_url or settings.CENTRAL_JWKS_URL
                logger.info("Fetching Central JWKS public keys from %s", url)
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(url)

                if response.status_code != 200:
                    logger.warning(
                        "Central JWKS endpoint returned status %s: %s",
                        response.status_code,
                        response.text[:200],
                    )
                    return False

                data = response.json()
                keys_list = data.get("keys", []) if isinstance(data, dict) else []

                new_keys_by_kid: Dict[str, str] = {}
                new_all_pems: List[str] = []

                for key_dict in keys_list:
                    try:
                        key_obj = jwk.construct(key_dict, algorithm="RS256")
                        pem = key_obj.to_pem().decode("utf-8").strip()
                        kid = key_dict.get("kid")
                        if kid:
                            new_keys_by_kid[kid] = pem
                        if pem not in new_all_pems:
                            new_all_pems.append(pem)
                    except Exception as key_err:
                        logger.warning("Failed to parse JWK key: %s", key_err)

                if new_all_pems:
                    self._keys_by_kid = new_keys_by_kid
                    self._all_pems = new_all_pems
                    self._last_fetched = now
                    logger.info("Successfully cached %d public key(s) from Central JWKS", len(new_all_pems))
                    return True
                else:
                    logger.warning("No valid RSA public keys found in JWKS response")
                    return False

            except Exception as e:
                logger.warning("Unable to fetch Central JWKS keys: %s", e)
                return False

    def get_candidate_keys(self, kid: Optional[str] = None) -> List[str]:
        """Return candidate PEM keys to try for decoding, prioritizing matching kid."""
        candidates: List[str] = []

        if kid and kid in self._keys_by_kid:
            candidates.append(self._keys_by_kid[kid])

        for pem in self._all_pems:
            if pem not in candidates:
                candidates.append(pem)

        # Fallback to locally persisted public key
        if settings.PUBLIC_KEY and settings.PUBLIC_KEY.strip() not in candidates:
            candidates.append(settings.PUBLIC_KEY.strip())

        return candidates

    async def refresh_if_needed(self) -> bool:
        """Trigger an on-demand refresh (e.g. on verification failure for key rotation)."""
        return await self.fetch_keys(force=True)

    async def start_background_refresh(self, interval_seconds: int = 3600):
        """Periodically refresh keys in the background."""
        while True:
            try:
                await asyncio.sleep(interval_seconds)
                await self.fetch_keys(force=True)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in JWKS background refresh loop: %s", e)


jwks_manager = JWKSManager()


async def verify_share_token(
    token: str,
    resource_id: str,
    own_node_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Verify an RS256 share token issued by Central.

    Validation rules:
    - RS256 signature must verify using Central's public key (from JWKS or cached)
    - `type` claim must be 'share_access'
    - `node_id` claim must match this node's own ID
    - `resource_id` claim must match the requested resource_id
    - `exp` expiration claim must be valid

    Any failure returns None (generic 404 upstream, never leaking failure reason).
    """
    if not token or not own_node_id:
        return None

    kid: Optional[str] = None
    try:
        unverified_header = jwt.get_unverified_header(token)
        if isinstance(unverified_header, dict):
            kid = unverified_header.get("kid")
    except Exception:
        return None

    candidate_keys = jwks_manager.get_candidate_keys(kid=kid)
    payload: Optional[Dict[str, Any]] = None

    for key in candidate_keys:
        try:
            payload = jwt.decode(token, key, algorithms=["RS256"])
            break
        except Exception:
            continue

    # If verification failed with cached keys, try on-demand JWKS refresh (key rotation)
    if payload is None:
        refreshed = await jwks_manager.refresh_if_needed()
        if refreshed:
            candidate_keys = jwks_manager.get_candidate_keys(kid=kid)
            for key in candidate_keys:
                try:
                    payload = jwt.decode(token, key, algorithms=["RS256"])
                    break
                except Exception:
                    continue

    if payload is None:
        return None

    # Claim validations:
    # 1. Token type must be 'share_access'
    if payload.get("type") != "share_access":
        return None

    # 2. node_id must match this node's own ID
    token_node_id = str(payload.get("node_id", ""))
    if not token_node_id or token_node_id != str(own_node_id):
        return None

    # 3. resource_id must match the path parameter
    token_resource_id = str(payload.get("resource_id", ""))
    if not token_resource_id or token_resource_id != str(resource_id):
        return None

    # 4. exp expiration must be present
    if "exp" not in payload:
        return None

    return payload
