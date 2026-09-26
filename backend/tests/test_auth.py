import uuid
import pytest
from datetime import datetime, timedelta, timezone
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core.security import decode_token
from app.dependencies import get_current_node_user
from app.service.pairing_service import persist_pairing_credentials, get_pairing_credentials
from app.config import settings


@pytest.mark.asyncio
async def test_decode_token_valid(make_token):
    user_id = str(uuid.uuid4())
    token = make_token(sub=user_id, ver=1)

    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["ver"] == 1


@pytest.mark.asyncio
async def test_decode_token_invalid_signature(make_token):
    # Generate a completely different private key to sign
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    token = make_token(sub=str(uuid.uuid4()), ver=1, private_key=other_pem)

    payload = decode_token(token)
    assert payload is None


@pytest.mark.asyncio
async def test_decode_token_expired(make_token):
    past_time = datetime.now(timezone.utc) - timedelta(hours=2)
    token = make_token(sub=str(uuid.uuid4()), ver=1, custom_claims={"exp": past_time})

    payload = decode_token(token)
    assert payload is None


@pytest.mark.asyncio
async def test_decode_token_malformed():
    payload = decode_token("not.a.valid.jwt.token")
    assert payload is None


@pytest.mark.asyncio
async def test_get_current_node_user_success(make_token, mock_db_session):
    user_id = str(uuid.uuid4())
    token = make_token(sub=user_id, ver=2, custom_claims={"display_name": "Test Alice"})

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user_cache = await get_current_node_user(credentials=creds, db=mock_db_session)

    assert user_cache is not None
    assert str(user_cache.user_id) == user_id
    assert str(user_cache.id) == user_id
    assert user_cache.display_name == "Test Alice"
    assert user_cache["sub"] == user_id


@pytest.mark.asyncio
async def test_get_current_node_user_missing_credentials(mock_db_session):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_node_user(credentials=None, db=mock_db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_node_user_missing_sub(make_token, mock_db_session):
    # Token with ver but no sub
    token = make_token(sub=None, ver=1)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_node_user(credentials=creds, db=mock_db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_node_user_missing_ver(make_token, mock_db_session):
    # Token with sub but no ver
    token = make_token(sub=str(uuid.uuid4()), ver=None)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_node_user(credentials=creds, db=mock_db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_node_user_invalid_token(mock_db_session):
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid-token")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_node_user(credentials=creds, db=mock_db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_without_token_returns_401(client):
    response = await client.get("/api/v1/files")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_with_invalid_token_returns_401(client):
    response = await client.get(
        "/api/v1/files",
        headers={"Authorization": "Bearer bogus-jwt-token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_persist_pairing_credentials(tmp_path, monkeypatch, rsa_keypair):
    _, public_pem = rsa_keypair
    temp_json = tmp_path / "test_pairing.json"
    temp_pem = tmp_path / "test_public.pem"

    monkeypatch.setattr("app.service.pairing_service.PAIRING_CREDENTIALS_PATH", temp_json)
    monkeypatch.setattr("app.service.pairing_service.PUBLIC_PEM_PATH", temp_pem)

    sample_claim = {
        "node_id": str(uuid.uuid4()),
        "session_token": "test-session-token-xyz",
        "session_token_expires_at": "2026-10-01T00:00:00Z",
        "public_key": public_pem,
        "cf_tunnel_token": "cf-test-token",
        "subdomain": "node-1",
    }

    persisted = persist_pairing_credentials(sample_claim)
    assert persisted["session_token"] == "test-session-token-xyz"
    assert persisted["public_key"] == public_pem
    assert settings.PUBLIC_KEY == public_pem

    # Verify JSON file written
    assert temp_json.exists()
    assert temp_pem.exists()
    assert temp_pem.read_text().strip() == public_pem.strip()

    # Verify retrieval
    creds = get_pairing_credentials()
    assert creds is not None
    assert creds["session_token"] == "test-session-token-xyz"


@pytest.mark.asyncio
async def test_pairing_status_endpoint(client):
    response = await client.get("/api/v1/node-pairing/status")
    assert response.status_code == 200
    data = response.json()
    assert "paired" in data