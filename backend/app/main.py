import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.core.rate_limiter import start_rate_limiter_pruning, stop_rate_limiter_pruning
from app.core.jwks import jwks_manager
from app.db import engine
from app.routes.files import router as files_router
from app.routes.pairing import router as pairing_router
from app.routes.shares import router as shares_router, public_slug_router
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

    # Ensure DB schema migrations are applied
    try:
        from alembic.config import Config
        from alembic import command
        from app.config import BACKEND_DIR, settings as app_settings
        alembic_ini = BACKEND_DIR / "alembic.ini"
        if alembic_ini.exists():
            cfg = Config(str(alembic_ini))
            cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
            cfg.set_main_option("sqlalchemy.url", app_settings.DATABASE_URL)
            await asyncio.to_thread(command.upgrade, cfg, "head")
            log.info("Startup complete: DB migrations up-to-date.")
    except Exception as e:
        log.warning(f"DB auto-migration note: {e}")

    # Ensure all tables exist as fallback
    try:
        from app.db.base import Base
        import app.models  # noqa: F401
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("Startup complete: DB schema verified.")
    except Exception as e:
        log.warning(f"DB schema verification note: {e}")

    log.info("Startup: starting in-memory rate limiter...")
    start_rate_limiter_pruning()
    log.info("Startup complete: rate limiter active.")

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

    jwks_refresh_task.cancel()
    await stop_rate_limiter_pruning()
    log.info("Shutdown complete: rate limiter pruning stopped.")
    await engine.dispose()
    log.info("Shutdown complete: DB engine disposed.")


app = FastAPI(title="Cachette API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://cachette.cloud",
        "https://cachette-central.onrender.com",
    ],
    allow_origin_regex=r"^https://.*(\.cachette\.cloud|\.cachette\.central\.onrender\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
async def health_check():
    log.info("Health check hit")
    return {"status": "ok"}


# ----------- API ENDPOINTS ------------ #

app.include_router(files_router, prefix="/api/v1")
app.include_router(pairing_router, prefix="/api/v1")
app.include_router(shares_router, prefix="/api/v1")
app.include_router(public_slug_router)
app.include_router(public_slug_router, prefix="/api/v1")

# ----------- STATIC FRONTEND ------------ #
from fastapi.staticfiles import StaticFiles
from app.config import PROJECT_ROOT

frontend_out = PROJECT_ROOT / "frontend" / "out"
if frontend_out.exists():
    app.mount("/", StaticFiles(directory=str(frontend_out), html=True), name="frontend")
