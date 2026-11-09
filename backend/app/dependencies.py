import math
from uuid import UUID
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.jwks import jwks_manager
from app.models.user import UserCache, DEFAULT_STORAGE_QUOTA_BYTES
from app.service.s3_service import S3Service
from app.service.pairing_service import get_owner_user_id
from app.config import settings, get_current_node_id
from app.core.rate_limiter import Token_Bucket_Rate_Limiter

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
    kid = None
    try:
        unverified_header = jwt.get_unverified_header(token)
        if isinstance(unverified_header, dict):
            kid = unverified_header.get("kid")
    except Exception:
        raise credentials_exception

    candidate_keys = jwks_manager.get_candidate_keys(kid=kid)
    payload = None
    for key in candidate_keys:
        try:
            payload = jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
            break
        except Exception:
            continue

    if payload is None:
        refreshed = await jwks_manager.refresh_if_needed()
        if refreshed:
            candidate_keys = jwks_manager.get_candidate_keys(kid=kid)
            for key in candidate_keys:
                try:
                    payload = jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
                    break
                except Exception:
                    continue

    if payload is None:
        raise credentials_exception

    # Contract claims: type=node_access, sub, ver
    if payload.get("type") != "node_access":
        raise credentials_exception

    sub = payload.get("sub")
    ver = payload.get("ver")
    if sub is None or ver is None:
        raise credentials_exception

    try:
        user_uuid = UUID(str(sub))
    except (ValueError, TypeError):
        raise credentials_exception

    # Fail closed: node must be configured with node_id and owner_id
    node_id = get_current_node_id()
    owner_id = get_owner_user_id()
    if not node_id or not owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Node pairing or owner configuration missing",
        )

    token_aud = str(payload.get("aud", ""))
    if not token_aud or token_aud != str(node_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Token is for a different node",
        )

    role = payload.get("role")
    if role not in ("owner", "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid role claim",
        )

    if role == "owner" and str(user_uuid) != str(owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: User is not the owner of this node",
        )

    # Read display name from token's name claim, fallback to "User"
    display_name = payload.get("name") or "User"

    user_cache = await db.get(UserCache, user_uuid)
    if not user_cache:
        user_cache = UserCache(
            user_id=user_uuid,
            display_name=display_name,
            storage_quota_bytes=DEFAULT_STORAGE_QUOTA_BYTES,
            storage_used=0,
        )
        db.add(user_cache)
        await db.commit()
        await db.refresh(user_cache)
    elif payload.get("name") and user_cache.display_name != payload.get("name"):
        user_cache.display_name = payload.get("name")
        await db.commit()
        await db.refresh(user_cache)

    user_cache.role = role
    return user_cache


async def require_owner(
    current_user: UserCache = Depends(get_current_node_user),
) -> UserCache:
    """Dependency that restricts access strictly to the node owner."""
    if getattr(current_user, "role", None) != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Node owner access required",
        )
    return current_user


def get_s3_service() -> S3Service:
    return S3Service()


def rate_limit(limiter: Token_Bucket_Rate_Limiter, get_identifier):
    """Rate limit dependency returning 429 with calculated Retry-After header on denial."""
    async def dependency(request: Request):
        identifier = get_identifier(request)
        allowed, remaining, retry_after = limiter.allow(identifier)
        if not allowed:
            retry_seconds = max(1, math.ceil(retry_after))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
                headers={"Retry-After": str(retry_seconds)},
            )
    return dependency


def rate_limit_user(limiter: Token_Bucket_Rate_Limiter):
    """Rate limit dependency per user returning 429 with calculated Retry-After header on denial."""
    async def dependency(current_user: UserCache = Depends(get_current_node_user)):
        allowed, remaining, retry_after = limiter.allow(str(current_user.id))
        if not allowed:
            retry_seconds = max(1, math.ceil(retry_after))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
                headers={"Retry-After": str(retry_seconds)},
            )
    return dependency


# General rate limiter for authenticated node users
general_limiter = Token_Bucket_Rate_Limiter(
    capacity=settings.GENERAL_BUCKET_CAPACITY,
    refill_rate=settings.GENERAL_BUCKET_REFILL_RATE,
    key_prefix="ratelimit:user",
)


def get_client_ip(request: Request) -> str:
    """Extract real client IP from Cloudflare, reverse proxy, or direct connection."""
    if cf_ip := request.headers.get("cf-connecting-ip"):
        return cf_ip.strip()
    if forwarded := request.headers.get("x-forwarded-for"):
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


# IP-keyed rate limiter for public shared file access (e.g. 60 requests capacity, 1 refill/sec)
shared_ip_limiter = Token_Bucket_Rate_Limiter(
    capacity=60,
    refill_rate=1.0,
    key_prefix="ratelimit:shared:ip",
)


# IP-keyed auth rate limiter (e.g. 5 requests capacity, 0.2 refill/sec -> 1 per 5s)
auth_limiter = Token_Bucket_Rate_Limiter(
    capacity=5,
    refill_rate=0.2,
    key_prefix="ratelimit:auth:ip",
)


# Rate limiter for tunnel restart operations (3 requests capacity, refill 0.05/sec -> 1 per 20s)
tunnel_restart_limiter = Token_Bucket_Rate_Limiter(
    capacity=3,
    refill_rate=0.05,
    key_prefix="ratelimit:tunnel:restart",
)


def is_localhost(request: Request) -> bool:
    """
    Check if a request originated purely on local loopback without passing through
    Cloudflare Tunnel or external proxies.
    """
    if request.headers.get("cf-connecting-ip") or request.headers.get("cf-ray"):
        return False
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "::1", "localhost", "testclient")


def require_localhost(request: Request) -> None:
    """Dependency that restricts access strictly to direct local loopback connections."""
    if not is_localhost(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Endpoint accessible only via local host",
        )

