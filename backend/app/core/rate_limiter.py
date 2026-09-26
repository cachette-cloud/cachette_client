import time
from app.core.redis_client import RedisClient

TOKEN_BUCKET_SCRIPT = """
local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or tonumber(ARGV[1])
local last_refill = tonumber(bucket[2]) or tonumber(ARGV[3])

local elapsed = (tonumber(ARGV[3]) - last_refill) / 1000
tokens = math.min(tonumber(ARGV[1]), tokens + elapsed * tonumber(ARGV[2]))

if tokens >= tonumber(ARGV[4]) then
    tokens = tokens - tonumber(ARGV[4])
    redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill', ARGV[3])
    redis.call('EXPIRE', KEYS[1], 3600)
    return 1
else
    redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill', ARGV[3])
    redis.call('EXPIRE', KEYS[1], 3600)
    return 0
end
"""

class Token_Bucket_Rate_Limiter:
    def __init__(self, capacity: int, refill_rate: float, key_prefix: str):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.key_prefix = key_prefix
        self._script_sha: str | None = None

    async def _get_script(self, client):
        if self._script_sha is None:
            self._script_sha = await client.script_load(TOKEN_BUCKET_SCRIPT)
        return self._script_sha

    async def check(self, identifier: str, cost: int = 1) -> bool:
        try:
            client = await RedisClient.get()
            sha = await self._get_script(client)
            now_ms = int(time.time() * 1000)
            key = f"{self.key_prefix}:{identifier}"
            try:
                allowed = await client.evalsha(sha, 1, key, self.capacity, self.refill_rate, now_ms, cost)
            except Exception:
                self._script_sha = None
                sha = await self._get_script(client)
                allowed = await client.evalsha(sha, 1, key, self.capacity, self.refill_rate, now_ms, cost)
            return bool(allowed)
        except Exception:
            # Fail-open: don't block user requests if Redis is unavailable
            return True