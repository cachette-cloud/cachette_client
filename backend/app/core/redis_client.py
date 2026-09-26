import redis.asyncio as aioredis 
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class RedisClient:
    """Singleton async Redis connection (Upstash)."""
    _client: aioredis.Redis = None

    @classmethod
    async def connect(cls):
        if cls._client is None:
            cls._client = aioredis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses = True
            )
            logger.info("Redis connected")

    @classmethod
    async def disconnect(cls):
        if cls._client is not None:
            await cls._client.aclose()
            cls._client = None
            logger.info("Redis disconnected")

    @classmethod
    async def get(cls) -> aioredis.Redis:
        if cls._client is None:
            raise RuntimeError("Redis not connected, call RedisClient.connect() first")
        return cls._client

    @classmethod
    async def ping(cls) -> bool:
        try:
            client = await cls.get()
            await client.ping()
            return True
        except Exception as e:
            logger.error(f"Redis ping failed: {e}")
            return False
