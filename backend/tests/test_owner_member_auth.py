import os
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import pytest
from httpx import AsyncClient
from fastapi.routing import APIRoute

from app.main import app
from app.config import settings
from app.dependencies import get_current_node_user, get_s3_service
from app.models.file import File
from app.models.user import UserCache
from tests.conftest import TEST_NODE_ID, TEST_OWNER_ID


@pytest.fixture
def mock_s3():
    fake_s3 = AsyncMock()
    fake_s3.object_exists = AsyncMock(return_value=True)

    async def fake_stream(key, expires_in=3600):
        yield b"user-file-content"

    fake_s3.get_object_stream = fake_stream
    app.dependency_overrides[get_s3_service] = lambda: fake_s3
    yield fake_s3
    app.dependency_overrides.pop(get_s3_service, None)


@pytest.mark.asyncio
async def test_wrong_aud_returns_403(client, make_token):
    """Valid signature and claims, but aud belongs to a different node -> 403 Forbidden."""
    wrong_aud_token = make_token(
        sub=TEST_OWNER_ID,
        aud="different-node-uuid-9999",
        role="owner",
    )
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={"Authorization": f"Bearer {wrong_aud_token}"},
    )
    assert resp.status_code == 403
    assert "different node" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_expired_token_returns_401(client, make_token):
    """Expired token returns 401 Unauthorized."""
    past_exp = datetime.now(timezone.utc) - timedelta(hours=1)
    expired_token = make_token(
        sub=TEST_OWNER_ID,
        custom_claims={"exp": past_exp},
    )
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_member_cannot_hit_owner_only_routes(client, make_token):
    """Members cannot hit owner-only routes (e.g. POST /files/{file_id}/share)."""
    member_id = str(uuid.uuid4())
    member_token = make_token(sub=member_id, role="member")
    file_id = str(uuid.uuid4())

    resp = await client.post(
        f"/api/v1/files/{file_id}/share",
        json={"access_level": "view"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert resp.status_code == 403
    assert "owner access required" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_users_cannot_read_each_others_files(client, make_token, mock_db_session, mock_s3):
    """User A cannot read or download User B's files (404 File not found)."""
    user_a_id = uuid.UUID(TEST_OWNER_ID)
    user_b_id = uuid.uuid4()

    # User A creates a file
    file_id = uuid.uuid4()
    file_a = File(
        id=file_id,
        owner_id=user_a_id,
        s3_key=f"users/{user_a_id}/{file_id}",
        filename="alice_secret.txt",
        size=100,
        content_type="text/plain",
        status="active",
    )
    mock_db_session.add(file_a)

    # User B (a member) tries to get User A's file metadata
    user_b_token = make_token(sub=str(user_b_id), role="member")
    resp_meta = await client.get(
        f"/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {user_b_token}"},
    )
    assert resp_meta.status_code == 404

    # User B tries to download User A's file
    resp_dl = await client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {user_b_token}"},
    )
    assert resp_dl.status_code == 404


@pytest.mark.asyncio
async def test_missing_owner_id_fails_closed(client, make_token, monkeypatch):
    """When node lacks owner_id configuration, all requests fail closed with 403."""
    monkeypatch.delenv("OWNER_ID", raising=False)
    monkeypatch.setattr("app.service.pairing_service.get_owner_user_id", lambda: None)

    valid_token = make_token(sub=TEST_OWNER_ID, role="owner")
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert resp.status_code == 403
    assert "configuration missing" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_missing_node_id_fails_closed(client, make_token, monkeypatch):
    """When node lacks node_id configuration, all requests fail closed with 403."""
    monkeypatch.setattr(settings, "NODE_ID", "")
    monkeypatch.setattr("app.config.get_current_node_id", lambda: "")

    valid_token = make_token(sub=TEST_OWNER_ID, role="owner")
    resp = await client.get(
        "/api/v1/node-pairing/session",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert resp.status_code == 403
    assert "configuration missing" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tunnel_headers_on_claim_and_tunnel_restart_return_403(client):
    """Requests with cf-connecting-ip or cf-ray to /claim and /tunnel/restart must be denied with 403."""
    # /claim with cf-connecting-ip
    claim_resp = await client.post(
        "/api/v1/node-pairing/claim",
        json={"pairing_code": "XYZ123"},
        headers={"cf-connecting-ip": "198.51.100.1"},
    )
    assert claim_resp.status_code == 403
    assert "accessible only via local host" in claim_resp.json()["detail"]

    # /tunnel/restart with cf-ray
    restart_resp = await client.post(
        "/api/v1/node-pairing/tunnel/restart",
        headers={"cf-ray": "ray-tunnel-1234"},
    )
    assert restart_resp.status_code == 403
    assert "accessible only via local host" in restart_resp.json()["detail"]


@pytest.mark.asyncio
async def test_share_route_rejects_node_access_token(client, make_token, mock_db_session, mock_s3):
    """Public /api/v1/shared/{resource_id} must reject node_access tokens with 404."""
    file_id = uuid.uuid4()
    file_row = File(
        id=file_id,
        owner_id=uuid.UUID(TEST_OWNER_ID),
        s3_key=f"users/{TEST_OWNER_ID}/{file_id}",
        filename="test.pdf",
        size=100,
        content_type="application/pdf",
        status="active",
    )
    mock_db_session.add(file_row)

    # Token with type=node_access instead of share_access
    node_token = make_token(
        token_type="node_access",
        custom_claims={"resource_id": str(file_id)},
    )
    resp = await client.get(f"/api/v1/shared/{file_id}?token={node_token}")
    assert resp.status_code == 404


def _has_auth_dependency(dependant) -> bool:
    """Recursively check if get_current_node_user is in the dependant tree."""
    if not dependant:
        return False
    for dep in dependant.dependencies:
        if dep.call is get_current_node_user:
            return True
        if _has_auth_dependency(dep):
            return True
    return False


@pytest.mark.asyncio
async def test_route_allowlist_enforces_auth_on_all_other_routes():
    """
    Every route outside the explicit allowlist MUST have get_current_node_user in its dependencies.
    """
    ALLOWLIST = {
        ("/health", "GET"),
        ("/api/v1/node-pairing/status", "GET"),
        ("/api/v1/node-pairing/claim", "POST"),
        ("/api/v1/node-pairing/tunnel/restart", "POST"),
        ("/s/{slug}", "GET"),
        ("/api/v1/s/{slug}", "GET"),
        ("/api/v1/shared/{resource_id}", "GET"),
    }

    unprotected_routes = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        path = route.path
        methods = route.methods or {"GET"}

        for method in methods:
            if method in ("OPTIONS", "HEAD"):
                continue

            if (path, method) in ALLOWLIST:
                continue

            # Check if route has get_current_node_user dependency
            has_auth = _has_auth_dependency(route.dependant)
            if not has_auth:
                unprotected_routes.append(f"{method} {path}")

    assert not unprotected_routes, (
        f"The following routes outside the allowlist lack get_current_node_user auth: {unprotected_routes}"
    )
