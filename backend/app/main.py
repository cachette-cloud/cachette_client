import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.rate_limiter import default_rate_limiter
from app.core.jwks import jwks_manager
from app.db import engine
from app.dependencies import (
    rate_limit,
    rate_limit_user,
    auth_limiter,
    general_limiter,
    get_client_ip,
    get_current_node_user,
)
from app.models.user import UserCache
from app.routes.files import router as files_router
from app.routes.pairing import router as pairing_router
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


@app.get("/health", tags=["health"])
async def health_check():
    log.info("Health check hit")
    return {"status": "ok"}


# Rate-limited auth and identity endpoints
@app.post("/signup", dependencies=[Depends(rate_limit(auth_limiter, get_client_ip))])
@app.post("/api/v1/auth/signup", dependencies=[Depends(rate_limit(auth_limiter, get_client_ip))])
async def signup():
    return {"status": "ok", "message": "Signup endpoint ready"}


@app.post("/login", dependencies=[Depends(rate_limit(auth_limiter, get_client_ip))])
@app.post("/api/v1/auth/login", dependencies=[Depends(rate_limit(auth_limiter, get_client_ip))])
async def login():
    return {"status": "ok", "message": "Login endpoint ready"}


@app.post("/refresh", dependencies=[Depends(rate_limit(auth_limiter, get_client_ip))])
@app.post("/api/v1/auth/refresh", dependencies=[Depends(rate_limit(auth_limiter, get_client_ip))])
async def refresh():
    return {"status": "ok", "message": "Refresh endpoint ready"}


@app.get("/me", dependencies=[Depends(rate_limit_user(general_limiter))])
@app.get("/api/v1/auth/me", dependencies=[Depends(rate_limit_user(general_limiter))])
async def me(current_user: UserCache = Depends(get_current_node_user)):
    return {
        "user_id": str(current_user.user_id),
        "display_name": current_user.display_name,
        "storage_quota_bytes": current_user.storage_quota_bytes,
        "storage_used": current_user.storage_used,
    }


# ----------- API ENDPOINTS ------------ #

app.include_router(files_router, prefix="/api/v1")
app.include_router(pairing_router, prefix="/api/v1")
app.include_router(shares_router, prefix="/api/v1")
app.include_router(public_slug_router)
app.include_router(public_slug_router, prefix="/api/v1")
