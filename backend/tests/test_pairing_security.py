import uuid
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
import pytest_asyncio

from app.config import settings
from app.service import pairing_service, tunnel_service
from app.dependencies import tunnel_restart_limiter


@pytest.fixture(autouse=True)
def reset_limiters_and_state(tmp_path, monkeypatch):
    """Reset rate limiter and mock pairing credentials storage."""
    tunnel_restart_limiter.clear()
    creds_path = tmp_path / "pairing_credentials.json"
    monkeypatch.setattr(pairing_service, "PAIRING_CREDENTIALS_PATH", creds_path)
    monkeypatch.setattr(tunnel_service, "PAIRING_CREDENTIALS_PATH", creds_path)
    tunnel_service._update_state("ready", True, None)
    yield
    tunnel_restart_limiter.clear()


@pytest.fixture
def paired_credentials(monkeypatch, make_token, tmp_path):
    user_id = str(uuid.uuid4())
    token = make_token(sub=user_id, ver=1, aud="node-uuid-12345", role="owner")
    creds = {
        "owner_id": user_id,
        "public_key": "sample-public-key",
        "node_id": "node-uuid-12345",
        "cf_tunnel_token": "cf-token-abcde",
        "subdomain": "testnode",
    }
    monkeypatch.setattr(settings, "NODE_ID", "node-uuid-12345")
    monkeypatch.setenv("OWNER_ID", user_id)
    monkeypatch.setattr(pairing_service, "get_pairing_credentials", lambda: creds)
    monkeypatch.setattr("app.routes.pairing.get_pairing_credentials", lambda: creds)
    return creds, token, user_id


@pytest.mark.asyncio
async def test_claim_forbidden_from_tunnel(client):
    """POST /claim must return 403 when requests arrive via Cloudflare Tunnel headers."""
    resp = await client.post(
        "/api/v1/node-pairing/claim",
        json={"pairing_code": "ABC123"},
        headers={"cf-connecting-ip": "203.0.113.1"},
    )
    assert resp.status_code == 403
    assert "accessible only via local host" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_tunnel_restart_forbidden_from_tunnel(client, paired_credentials):
    """POST /tunnel/restart must return 403 when requests arrive via Cloudflare Tunnel headers."""
    resp = await client.post(
        "/api/v1/node-pairing/tunnel/restart",
        headers={"cf-ray": "ray-12345"},
    )
    assert resp.status_code == 403
    assert "accessible only via local host" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_session_unauthorized_from_tunnel_without_auth(client, paired_credentials):
    """GET /session must return 401 when requests arrive via tunnel without a Bearer token."""
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={"cf-connecting-ip": "203.0.113.1"},
    )
    assert resp.status_code == 401
    assert "Could not validate credentials" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_session_forbidden_from_tunnel_for_non_owner(client, paired_credentials, make_token):
    """User claiming role=owner who is NOT the node owner must return 403."""
    other_user_id = str(uuid.uuid4())
    other_token = make_token(sub=other_user_id, ver=1, aud="node-uuid-12345", role="owner")
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={
            "cf-connecting-ip": "203.0.113.1",
            "Authorization": f"Bearer {other_token}",
        },
    )
    assert resp.status_code == 403
    assert "not the owner of this node" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_owner_only_routes_forbidden_for_member(client, paired_credentials, make_token):
    """Owner-only routes (such as public share generation) must return 403 for members."""
    member_user_id = str(uuid.uuid4())
    member_token = make_token(sub=member_user_id, ver=1, aud="node-uuid-12345", role="member")
    file_id = str(uuid.uuid4())
    resp = await client.post(
        f"/api/v1/files/{file_id}/share",
        json={"access_level": "view"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert resp.status_code == 403
    assert "owner access required" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_session_allowed_from_tunnel_with_valid_bearer_token_and_no_token_leak(
    client, paired_credentials
):
    """GET /session with valid Bearer token through tunnel returns metadata but NEVER the raw session_token."""
    _, token, user_id = paired_credentials
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={
            "cf-connecting-ip": "203.0.113.1",
            "Authorization": f"Bearer {token}",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["paired"] is True
    assert data["node_id"] == "node-uuid-12345"
    assert data["subdomain"] == "testnode"
    assert "session_token" not in data  # Token MUST NOT be leaked!


@pytest.mark.asyncio
async def test_session_allowed_from_localhost_and_no_token_leak(client, paired_credentials):
    """GET /session on localhost returns session state with valid Bearer token without leaking session_token."""
    _, token, _ = paired_credentials
    resp = await client.get("/api/v1/node-pairing/session", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["paired"] is True
    assert data["node_id"] == "node-uuid-12345"
    assert "session_token" not in data  # Token MUST NOT be leaked!


@pytest.mark.asyncio
async def test_status_sanitized_for_tunnel(client, paired_credentials):
    """GET /status from tunnel must return only minimal non-sensitive keys."""
    resp = await client.get(
        "/api/v1/node-pairing/status",
        headers={"cf-connecting-ip": "203.0.113.1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"paired": True, "tunnel_ready": True}
    assert "subdomain" not in data
    assert "node_id" not in data
    assert "session_token_expires_at" not in data
    assert "tunnel_error" not in data
    assert "tunnel_command" not in data


@pytest.mark.asyncio
async def test_status_full_for_localhost(client, paired_credentials):
    """GET /status on localhost returns full diagnostics."""
    resp = await client.get("/api/v1/node-pairing/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["paired"] is True
    assert data["node_id"] == "node-uuid-12345"
    assert data["subdomain"] == "testnode"
    assert data["tunnel_command"] == "Managed natively by Cachette supervisor"


@pytest.mark.asyncio
async def test_tunnel_restart_concurrent_conflict_409(client, paired_credentials, monkeypatch):
    """POST /tunnel/restart returns 409 Conflict if a restart workflow is already in progress."""
    monkeypatch.setattr(tunnel_service, "is_tunnel_restart_in_progress", lambda: True)
    monkeypatch.setattr("app.routes.pairing.is_tunnel_restart_in_progress", lambda: True)

    resp = await client.post("/api/v1/node-pairing/tunnel/restart")
    assert resp.status_code == 409
    assert "already in progress" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tunnel_restart_rate_limited(client, paired_credentials, monkeypatch):
    """POST /tunnel/restart enforces rate limit (3 capacity, 4th request gets 429)."""
    monkeypatch.setattr(tunnel_service, "is_tunnel_restart_in_progress", lambda: False)
    monkeypatch.setattr("app.routes.pairing.is_tunnel_restart_in_progress", lambda: False)
    monkeypatch.setattr("app.routes.pairing.trigger_tunnel_restart", lambda token: None)

    for _ in range(3):
        resp = await client.post("/api/v1/node-pairing/tunnel/restart")
        assert resp.status_code == 200

    # 4th rapid request exceeds bucket capacity
    resp4 = await client.post("/api/v1/node-pairing/tunnel/restart")
    assert resp4.status_code == 429
    assert resp4.headers.get("Retry-After") is not None
