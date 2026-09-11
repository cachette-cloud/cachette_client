import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.redis_client import RedisClient

from app.main import app
from app.db.base import Base
from app.db.session import get_db

TEST_DATABASE_URL = "postgresql+asyncpg://dev:dev@localhost:5432/test_filestorage"


@pytest_asyncio.fixture(scope="function")
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL)
    TestSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    await RedisClient.connect()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await RedisClient.disconnect()


@pytest_asyncio.fixture(autouse=True)
async def clear_rate_limits():
    try:
        await RedisClient.connect()
        redis_client = await RedisClient.get()
        keys = await redis_client.keys("ratelimit:*")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass
    yield