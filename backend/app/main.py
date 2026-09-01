import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.core.redis_client import RedisClient
from app.db import engine
from app.routes.auth import router as auth_router
from app.routes.files import router as files_router

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

    yield

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
async def health_check():
    log.info("Health check hit")
    return {"status": "ok"}


# ----------- API ENDPOINTS ------------ #

app.include_router(auth_router, prefix="/api/v1")
app.include_router(files_router, prefix="/api/v1")


