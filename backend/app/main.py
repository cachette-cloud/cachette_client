import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.core.redis_client import RedisClient
from app.core.jwks import jwks_manager
from app.db import engine
from app.routes.files import router as files_router
from app.routes.pairing import router as pairing_router
from app.routes.shares import router as shares_router
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

    log.info("Startup: connecting to Redis...")
    await RedisClient.connect()
    log.info("Startup complete: Redis connected.")

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
    await RedisClient.disconnect()
    log.info("Shutdown complete: Redis disconnected.")
    await engine.dispose()
    log.info("Shutdown complete: DB engine disposed.")


app = FastAPI(title="Cachette API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://cachette.cloud",
        "https://www.cachette.cloud",
    ],
    allow_origin_regex=r"^https://.*\.cachette\.cloud$",
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
