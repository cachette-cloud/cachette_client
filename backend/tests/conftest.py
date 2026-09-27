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
from app.core.redis_client import RedisClient
from app.models.user import UserCache


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
    """Automatically set settings.PUBLIC_KEY to the test public key for all tests."""
    _, public_pem = rsa_keypair
    original_key = settings.PUBLIC_KEY
    settings.PUBLIC_KEY = public_pem
    yield
    settings.PUBLIC_KEY = original_key


@pytest.fixture
def make_token(rsa_keypair):
    """Factory fixture to create RS256 JWT tokens with custom claims."""
    private_pem, _ = rsa_keypair

    def _make(
        sub: str | None = None,
        ver: int | None = 1,
        token_type: str = "access",
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
        if custom_claims:
            payload.update(custom_claims)

        key_to_use = private_key or private_pem
        return jwt.encode(payload, key_to_use, algorithm="RS256")

    return _make


from app.models.file import File


@pytest_asyncio.fixture(scope="function")
async def mock_db_session():
    """Mock async DB session that simulates UserCache and File storage in memory."""
    session = AsyncMock()
    users_store = {}
    files_store = {}

    async def mock_get(model, pk):
        if model is UserCache:
            return users_store.get(str(pk))
        if model is File:
            return files_store.get(str(pk))
        return None

    def mock_add(instance):
        if isinstance(instance, UserCache):
            users_store[str(instance.user_id)] = instance
        elif isinstance(instance, File):
            files_store[str(instance.id)] = instance

    async def mock_commit():
        pass

    async def mock_refresh(instance):
        pass

    session.get = AsyncMock(side_effect=mock_get)
    session.add = MagicMock(side_effect=mock_add)
    session.commit = AsyncMock(side_effect=mock_commit)
    session.refresh = AsyncMock(side_effect=mock_refresh)
    session._users_store = users_store
    session._files_store = files_store

    return session


@pytest_asyncio.fixture(scope="function")
async def client(mock_db_session):
    """Async HTTP test client with mocked DB session and bypass for Redis."""
    async def override_get_db():
        yield mock_db_session

    app.dependency_overrides[get_db] = override_get_db

    # Mock Redis client so tests don't require running Redis instance
    fake_redis = AsyncMock()
    fake_redis.check = AsyncMock(return_value=True)
    fake_redis.get = AsyncMock(return_value=None)
    fake_redis.keys = AsyncMock(return_value=[])
    fake_redis.delete = AsyncMock(return_value=True)
    RedisClient._client = fake_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    RedisClient._client = None