import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, APIRouter
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.rate_limiter import default_rate_limiter
from app.core.jwks import jwks_manager
from app.db import engine
from app.dependencies import (
    rate_limit,
    rate_limit_user,
    general_limiter,
    get_client_ip,
    get_current_node_user,
)
from app.models.user import UserCache
from app.routes.files import router as files_router
from app.routes.pairing import router as pairing_router, session_router as pairing_session_router
from app.routes.shares import router as shares_router, public_slug_router
from app.runtime import get_process_manager, BinaryDownloader
from app.runtime.service_setup import setup_minio
from app.service.s3_service import s3_service
from app.service.tunnel_service import ensure_cloudflared_on_startup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

log = logging.getLogger("cachette")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Startup: verifying DB connection...")
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    log.info("Startup complete: DB connection verified.")

    # Start periodic in-memory rate limiter sweeper
    sweeper_task = asyncio.create_task(default_rate_limiter.run_sweeper())
    log.info("Startup complete: In-memory rate limiter sweeper started.")

    # Start native ProcessManager supervisor (MinIO)
    pm = get_process_manager()
    downloader = BinaryDownloader(bin_dir=pm.bin_dir)
    supervisor_monitor_task = asyncio.create_task(pm.run_monitor_loop())

    if settings.AUTO_DOWNLOAD_BINARIES:
        try:
            log.info("Startup: initializing native MinIO service...")
            setup_minio(pm, downloader)
            loop = asyncio.get_event_loop()
            started, msg = await loop.run_in_executor(None, pm.start, "minio", True)
            if started:
                log.info("Startup complete: MinIO native service ready.")
            else:
                log.warning(f"MinIO native service start: {msg}")
        except Exception as e:
            log.warning(f"Unable to auto-start native MinIO: {e}")

    log.info("Startup: ensuring S3 bucket exists...")
    try:
        await s3_service.ensure_bucket_exists()
        log.info("Startup complete: S3 bucket ready.")
    except Exception as e:
        log.warning(f"Unable to initialize S3 bucket on startup: {e}")

    # Fetch Central JWKS public keys on startup and schedule periodic refresh
    log.info("Startup: fetching Central JWKS public keys...")
    try:
        await jwks_manager.fetch_keys()
    except Exception as e:
        log.warning(f"Initial JWKS fetch failed, using fallback public key: {e}")

    jwks_refresh_task = asyncio.create_task(
        jwks_manager.start_background_refresh(interval_seconds=3600)
    )

    # Startup resilience: automatically ensure cloudflared is online if paired
    asyncio.create_task(ensure_cloudflared_on_startup())

    yield

    # Clean shutdown of background tasks
    sweeper_task.cancel()
    try:
        await sweeper_task
    except asyncio.CancelledError:
        pass
    log.info("Shutdown complete: Rate limiter sweeper cancelled.")

    supervisor_monitor_task.cancel()
    try:
        await supervisor_monitor_task
    except asyncio.CancelledError:
        pass

    # Cleanly stop all supervised native subprocesses
    pm.shutdown_all()
    log.info("Shutdown complete: Supervised native processes stopped.")

    jwks_refresh_task.cancel()
    await engine.dispose()
    log.info("Shutdown complete: DB engine disposed.")


app = FastAPI(title="Cachette API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://cachette.cloud",
    ],
    allow_origin_regex=r"^https://.*\.cachette\.central\.onrender\.com$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Allowlisted public endpoints
@app.get("/health", tags=["health"])
async def health_check():
    log.info("Health check hit")
    return {"status": "ok"}


# ----------- AUTHENTICATED API ROUTER (Auth by Default) ------------ #

api_v1 = APIRouter(prefix="/api/v1", dependencies=[Depends(get_current_node_user)])

# Mount authenticated files routes and session routes
api_v1.include_router(files_router)
api_v1.include_router(pairing_session_router)


@api_v1.get("/me", dependencies=[Depends(rate_limit_user(general_limiter))])
@api_v1.get("/auth/me", dependencies=[Depends(rate_limit_user(general_limiter))])
@app.get("/me", dependencies=[Depends(get_current_node_user), Depends(rate_limit_user(general_limiter))])
async def me(current_user: UserCache = Depends(get_current_node_user)):
    return {
        "user_id": str(current_user.user_id),
        "display_name": current_user.display_name,
        "role": getattr(current_user, "role", "member"),
        "storage_quota_bytes": current_user.storage_quota_bytes,
        "storage_used": current_user.storage_used,
    }

# Mount authenticated router
app.include_router(api_v1)

# ----------- EXPLICIT UNAUTHENTICATED ALLOWLIST ------------ #
# Only mount explicit allowlist endpoints without default auth:
# 1. /health (mounted above)
# 2. /api/v1/node-pairing/claim (require_localhost)
# 3. /api/v1/node-pairing/status (sanitized remote response)
# 4. /api/v1/node-pairing/tunnel/restart (require_localhost)
# 5. /s/{slug} & /api/v1/s/{slug} (public slug file shares)
# 6. /api/v1/shared/{resource_id} (RS256 token query param via JWKS)

app.include_router(pairing_router, prefix="/api/v1")
app.include_router(shares_router, prefix="/api/v1")
app.include_router(public_slug_router)
app.include_router(public_slug_router, prefix="/api/v1")
