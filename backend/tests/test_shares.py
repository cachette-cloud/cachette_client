import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from jose import jwt

from app.config import settings
from app.dependencies import get_s3_service
from app.main import app
from app.models.file import File
from app.models.user import UserCache
from app.core.jwks import jwks_manager


@pytest.fixture
def test_node_id():
    node_id = str(uuid.uuid4())
    original = settings.NODE_ID
    settings.NODE_ID = node_id
    yield node_id
    settings.NODE_ID = original


@pytest.fixture
def mock_s3():
    fake_s3 = AsyncMock()
    fake_s3.object_exists = AsyncMock(return_value=True)

    async def fake_stream(key, expires_in=3600):
        yield b"chunk-1"
        yield b"chunk-2"

    fake_s3.get_object_stream = fake_stream
    app.dependency_overrides[get_s3_service] = lambda: fake_s3
    yield fake_s3
    app.dependency_overrides.pop(get_s3_service, None)


@pytest.fixture
def create_test_file(mock_db_session):
    def _create(file_id=None, status="active", filename="document.pdf", content_type="application/pdf"):
        fid = file_id or uuid.uuid4()
        user_id = uuid.uuid4()
        file_row = File(
            id=fid,
            owner_id=user_id,
            s3_key=f"users/{user_id}/{fid}",
            filename=filename,
            size=14,
            content_type=content_type,
            status=status,
        )
        mock_db_session.add(file_row)
        return file_row

    return _create


@pytest.mark.asyncio
async def test_shared_file_view_success(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id, filename="preview.png", content_type="image/png")

    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")

    assert response.status_code == 200
    assert response.headers.get("Content-Disposition") == "inline"
    assert response.headers.get("Content-Type") == "image/png"
    assert response.content == b"chunk-1chunk-2"


@pytest.mark.asyncio
async def test_shared_file_download_success(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id, filename="archive.zip", content_type="application/zip")

    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "download",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")

    assert response.status_code == 200
    assert response.headers.get("Content-Disposition") == 'attachment; filename="archive.zip"'
    assert response.headers.get("Content-Type") == "application/zip"
    assert response.content == b"chunk-1chunk-2"


@pytest.mark.asyncio
async def test_shared_file_mismatched_resource_id(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)

    other_file_id = uuid.uuid4()
    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(other_file_id),  # Mismatch with URL path
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_shared_file_mismatched_node_id(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)

    other_node_id = str(uuid.uuid4())
    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(file_id),
            "node_id": other_node_id,  # Mismatch with this node's ID
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_shared_file_wrong_token_type(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)

    token = make_token(
        token_type="access",  # Not "share_access"
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_shared_file_expired_token(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)

    past = datetime.now(timezone.utc) - timedelta(minutes=10)
    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": past,
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_shared_file_invalid_signature(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)

    # Generate a completely untrusted private key
    other_key = rsa.generate_private_key(65537, 2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    token = make_token(
        token_type="share_access",
        private_key=other_pem,
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_shared_file_not_in_database(client, make_token, test_node_id, mock_s3):
    non_existent_file_id = uuid.uuid4()

    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(non_existent_file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{non_existent_file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_shared_file_missing_in_s3(client, make_token, test_node_id, create_test_file, mock_s3):
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)
    mock_s3.object_exists.return_value = False

    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_jwks_refresh_on_rotated_key(client, test_node_id, create_test_file, mock_s3):
    """Test that if a token is signed with a newly rotated key, verify_share_token refreshes JWKS."""
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id)

    # Generate a new rotated keypair
    new_key = rsa.generate_private_key(65537, 2048)
    new_private_pem = new_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    new_public_pem = new_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "type": "share_access",
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "permission": "view",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        new_private_pem,
        algorithm="RS256",
        headers={"kid": "rotated-kid-1"},
    )

    # Mock jwks_manager.refresh_if_needed to simulate successfully fetching new rotated key
    async def mock_refresh(force=True):
        jwks_manager._keys_by_kid["rotated-kid-1"] = new_public_pem
        jwks_manager._all_pems.append(new_public_pem)
        return True

    with patch.object(jwks_manager, "refresh_if_needed", side_effect=mock_refresh):
        response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
        assert response.status_code == 200
        assert response.headers.get("Content-Disposition") == "inline"


@pytest.mark.asyncio
async def test_shared_file_access_level_claim_download(client, make_token, test_node_id, create_test_file, mock_s3):
    """Test that access_level='download' sets attachment Content-Disposition."""
    file_id = uuid.uuid4()
    create_test_file(file_id=file_id, filename="report.csv", content_type="text/csv")

    token = make_token(
        token_type="share_access",
        custom_claims={
            "resource_id": str(file_id),
            "node_id": test_node_id,
            "access_level": "download",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
    )

    response = await client.get(f"/api/v1/shared/{file_id}?token={token}")
    assert response.status_code == 200
    assert response.headers.get("Content-Disposition") == 'attachment; filename="report.csv"'
    assert response.headers.get("Content-Type").startswith("text/csv")
    assert response.content == b"chunk-1chunk-2"

