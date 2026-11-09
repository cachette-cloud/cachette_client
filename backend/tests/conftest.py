import os
import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from jose import jwt

from app.main import app
from app.config import settings
from app.db.session import get_db
from app.core.rate_limiter import default_rate_limiter
from app.models.user import UserCache


TEST_NODE_ID = "test-node-uuid-0000"
TEST_OWNER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="session")
def rsa_keypair():
    """Generate a test RSA 2048-bit keypair for RS256 token signing and verification."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    return private_pem, public_pem


@pytest.fixture(autouse=True)
def setup_test_public_key(rsa_keypair):
    """Automatically set settings.PUBLIC_KEY and test node IDs for all tests."""
    _, public_pem = rsa_keypair
    original_key = settings.PUBLIC_KEY
    original_node_id = settings.NODE_ID
    original_auto_download = settings.AUTO_DOWNLOAD_BINARIES
    original_owner_env = os.environ.get("OWNER_ID")

    settings.PUBLIC_KEY = public_pem
    settings.NODE_ID = TEST_NODE_ID
    settings.AUTO_DOWNLOAD_BINARIES = False
    os.environ["OWNER_ID"] = TEST_OWNER_ID
    default_rate_limiter.clear()

    yield

    settings.PUBLIC_KEY = original_key
    settings.NODE_ID = original_node_id
    settings.AUTO_DOWNLOAD_BINARIES = original_auto_download
    if original_owner_env is not None:
        os.environ["OWNER_ID"] = original_owner_env
    else:
        os.environ.pop("OWNER_ID", None)
    default_rate_limiter.clear()


@pytest.fixture
def make_token(rsa_keypair):
    """Factory fixture to create RS256 JWT tokens with custom claims."""
    private_pem, _ = rsa_keypair

    def _make(
        sub: str | None = TEST_OWNER_ID,
        ver: int | None = 1,
        token_type: str = "node_access",
        aud: str | None = TEST_NODE_ID,
        role: str | None = "owner",
        custom_claims: dict | None = None,
        private_key: str | None = None,
    ) -> str:
        payload = {}
        if sub is not None:
            payload["sub"] = sub
        if ver is not None:
            payload["ver"] = ver
        if token_type is not None:
            payload["type"] = token_type
        if token_type == "node_access":
            if aud is not None:
                payload["aud"] = aud
            if role is not None:
                payload["role"] = role
        else:
            if aud is not None and aud != TEST_NODE_ID:
                payload["aud"] = aud
            if role is not None and role != "owner":
                payload["role"] = role
        if custom_claims:
            payload.update(custom_claims)

        key_to_use = private_key or private_pem
        return jwt.encode(payload, key_to_use, algorithm="RS256")

    return _make


from app.models.file import File
from app.models.share import Share


@pytest_asyncio.fixture(scope="function")
async def mock_db_session():
    """Mock async DB session that simulates UserCache, File, and Share storage in memory."""
    session = AsyncMock()
    users_store = {}
    files_store = {}
    shares_store = {}

    async def mock_get(model, pk):
        if model is UserCache:
            return users_store.get(str(pk))
        if model is File:
            return files_store.get(str(pk))
        if model is Share:
            return shares_store.get(str(pk))
        return None

    def mock_add(instance):
        if isinstance(instance, UserCache):
            users_store[str(instance.user_id)] = instance
        elif isinstance(instance, File):
            files_store[str(instance.id)] = instance
        elif isinstance(instance, Share):
            shares_store[str(instance.id)] = instance

    async def mock_commit():
        pass

    async def mock_refresh(instance):
        pass

    async def mock_execute(stmt):
        mock_result = MagicMock()
        stmt_str = str(stmt).lower()
        if "shares" in stmt_str:
            matched = list(shares_store.values())
            try:
                compiled = stmt.compile()
                cparams = compiled.params
            except Exception:
                cparams = {}
            filtered = []
            for s in matched:
                match = True
                for k, v in cparams.items():
                    if "slug" in k and s.slug != v:
                        match = False
                    if "file_id" in k and str(s.file_id) != str(v):
                        match = False
                    if "access_level" in k and s.access_level != v:
                        match = False
                if match:
                    filtered.append(s)
            mock_result.scalars.return_value.first = MagicMock(side_effect=lambda: filtered[0] if filtered else None)
            mock_result.scalars.return_value.all = MagicMock(side_effect=lambda: filtered)
            return mock_result

        mock_result.scalars.return_value.first.return_value = None
        mock_result.scalars.return_value.all.return_value = []
        return mock_result

    session.get = AsyncMock(side_effect=mock_get)
    session.add = MagicMock(side_effect=mock_add)
    session.commit = AsyncMock(side_effect=mock_commit)
    session.refresh = AsyncMock(side_effect=mock_refresh)
    session.execute = AsyncMock(side_effect=mock_execute)
    session._users_store = users_store
    session._files_store = files_store
    session._shares_store = shares_store

    return session


@pytest_asyncio.fixture(scope="function")
async def client(mock_db_session):
    """Async HTTP test client with mocked DB session and in-memory rate limiter."""
    async def override_get_db():
        yield mock_db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
