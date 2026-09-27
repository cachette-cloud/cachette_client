import uuid
from unittest.mock import AsyncMock
import pytest

from app.config import settings
from app.dependencies import get_s3_service
from app.main import app
from app.models.file import File
from app.models.user import UserCache
from app.models.share import Share


@pytest.fixture
def mock_s3():
    fake_s3 = AsyncMock()
    fake_s3.object_exists = AsyncMock(return_value=True)

    async def fake_stream(key, expires_in=3600):
        yield b"hello-"
        yield b"shared-world"

    fake_s3.get_object_stream = fake_stream
    app.dependency_overrides[get_s3_service] = lambda: fake_s3
    yield fake_s3
    app.dependency_overrides.pop(get_s3_service, None)


@pytest.fixture
def test_user(mock_db_session):
    user_id = uuid.uuid4()
    user = UserCache(
        user_id=user_id,
        display_name="Test Owner",
        storage_quota_bytes=5368709120,
        storage_used=0,
    )
    mock_db_session.add(user)
    return user


@pytest.fixture
def auth_headers(test_user, make_token):
    token = make_token(sub=str(test_user.user_id), ver=1)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_file(mock_db_session, test_user):
    file_id = uuid.uuid4()
    file_row = File(
        id=file_id,
        owner_id=test_user.user_id,
        s3_key=f"users/{test_user.user_id}/{file_id}",
        filename="project-notes.pdf",
        size=1024,
        content_type="application/pdf",
        status="active",
    )
    mock_db_session.add(file_row)
    return file_row


@pytest.mark.asyncio
async def test_create_share_view_success(client, auth_headers, test_file):
    settings.SUBDOMAIN = "home"
    response = await client.post(
        f"/api/v1/files/{test_file.id}/share",
        json={"access_level": "view"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["file_id"] == str(test_file.id)
    assert data["access_level"] == "view"
    assert len(data["slug"]) >= 10
    assert data["url"] == f"https://home.cachette.cloud/s/{data['slug']}"


@pytest.mark.asyncio
async def test_reuse_existing_share(client, auth_headers, test_file):
    settings.SUBDOMAIN = "home"
    # First create
    res1 = await client.post(
        f"/api/v1/files/{test_file.id}/share",
        json={"access_level": "view"},
        headers=auth_headers,
    )
    assert res1.status_code == 200
    slug1 = res1.json()["slug"]

    # Second call with same access_level must reuse the existing share
    res2 = await client.post(
        f"/api/v1/files/{test_file.id}/share",
        json={"access_level": "view"},
        headers=auth_headers,
    )
    assert res2.status_code == 200
    slug2 = res2.json()["slug"]
    assert slug1 == slug2


@pytest.mark.asyncio
async def test_create_share_download_distinct_slug(client, auth_headers, test_file):
    settings.SUBDOMAIN = "home"
    res_view = await client.post(
        f"/api/v1/files/{test_file.id}/share",
        json={"access_level": "view"},
        headers=auth_headers,
    )
    assert res_view.status_code == 200
    view_slug = res_view.json()["slug"]

    res_download = await client.post(
        f"/api/v1/files/{test_file.id}/share",
        json={"access_level": "download"},
        headers=auth_headers,
    )
    assert res_download.status_code == 200
    download_slug = res_download.json()["slug"]
    assert view_slug != download_slug
    assert res_download.json()["access_level"] == "download"


@pytest.mark.asyncio
async def test_create_share_non_owner_rejected(client, make_token, test_file):
    other_user_token = make_token(sub=str(uuid.uuid4()), ver=1)
    response = await client.post(
        f"/api/v1/files/{test_file.id}/share",
        json={"access_level": "view"},
        headers={"Authorization": f"Bearer {other_user_token}"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_public_get_share_view_stream(client, mock_db_session, test_file, mock_s3):
    share = Share(
        id=uuid.uuid4(),
        file_id=test_file.id,
        access_level="view",
        slug="abc123view",
    )
    mock_db_session.add(share)

    # Public GET /s/{slug} requires NO authorization header
    response = await client.get("/s/abc123view")
    assert response.status_code == 200
    assert response.headers.get("Content-Disposition") == "inline"
    assert response.headers.get("Content-Type") == "application/pdf"
    assert response.content == b"hello-shared-world"


@pytest.mark.asyncio
async def test_public_get_share_download_stream(client, mock_db_session, test_file, mock_s3):
    share = Share(
        id=uuid.uuid4(),
        file_id=test_file.id,
        access_level="download",
        slug="xyz789down",
    )
    mock_db_session.add(share)

    response = await client.get("/s/xyz789down")
    assert response.status_code == 200
    assert response.headers.get("Content-Disposition") == f'attachment; filename="{test_file.filename}"'
    assert response.headers.get("Content-Type") == "application/pdf"
    assert response.content == b"hello-shared-world"


@pytest.mark.asyncio
async def test_public_get_share_not_found(client, mock_s3):
    response = await client.get("/s/nonexistentslug")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_public_get_share_inactive_file(client, mock_db_session, test_user, mock_s3):
    file_id = uuid.uuid4()
    inactive_file = File(
        id=file_id,
        owner_id=test_user.user_id,
        s3_key=f"users/{test_user.user_id}/{file_id}",
        filename="deleted.txt",
        size=10,
        content_type="text/plain",
        status="deleted",
    )
    mock_db_session.add(inactive_file)
    share = Share(
        id=uuid.uuid4(),
        file_id=file_id,
        access_level="view",
        slug="inactiveslug",
    )
    mock_db_session.add(share)

    response = await client.get("/s/inactiveslug")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_public_get_share_missing_in_s3(client, mock_db_session, test_file, mock_s3):
    mock_s3.object_exists = AsyncMock(return_value=False)
    share = Share(
        id=uuid.uuid4(),
        file_id=test_file.id,
        access_level="view",
        slug="s3missingslug",
    )
    mock_db_session.add(share)

    response = await client.get("/s/s3missingslug")
    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"
