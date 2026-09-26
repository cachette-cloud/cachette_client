from uuid import UUID
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import UserCache, DEFAULT_STORAGE_QUOTA_BYTES
from app.service.s3_service import S3Service
from app.core.rate_limiter import Token_Bucket_Rate_Limiter
from app.config import settings

security_scheme = HTTPBearer(auto_error=False)


async def get_current_node_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserCache:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    sub = payload.get("sub")
    ver = payload.get("ver")
    if sub is None or ver is None:
        raise credentials_exception

    try:
        user_uuid = UUID(str(sub))
    except (ValueError, TypeError):
        raise credentials_exception

    user_cache = await db.get(UserCache, user_uuid)
    if not user_cache:
        user_cache = UserCache(
            user_id=user_uuid,
            display_name=payload.get("display_name") or payload.get("name") or "Node User",
            storage_quota_bytes=DEFAULT_STORAGE_QUOTA_BYTES,
            storage_used=0,
        )
        db.add(user_cache)
        await db.commit()
        await db.refresh(user_cache)

    return user_cache


def get_s3_service() -> S3Service:
    return S3Service()


def rate_limit(limiter: Token_Bucket_Rate_Limiter, get_identifier):
    async def dependency(request: Request):
        identifier = get_identifier(request)
        if not await limiter.check(identifier):
            raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": "1"})
    return dependency


def rate_limit_user(limiter: Token_Bucket_Rate_Limiter):
    async def dependency(current_user: UserCache = Depends(get_current_node_user)):
        if not await limiter.check(str(current_user.id)):
            raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": "1"})
    return dependency


# General rate limiter for authenticated node users
general_limiter = Token_Bucket_Rate_Limiter(
    capacity=settings.GENERAL_BUCKET_CAPACITY,
    refill_rate=settings.GENERAL_BUCKET_REFILL_RATE,
    key_prefix="ratelimit:user",
)