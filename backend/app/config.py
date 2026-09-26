import json
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

PAIRING_CREDENTIALS_PATH = Path(os.getenv("PAIRING_CREDENTIALS_PATH", "pairing_credentials.json"))
PUBLIC_PEM_PATH = Path(os.getenv("PUBLIC_PEM_PATH", "public.pem"))

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
ROOT_ENV_PATH = PROJECT_ROOT / ".env"
BACKEND_ENV_PATH = BACKEND_DIR / ".env"
DOCKER_COMPOSE_PATH = PROJECT_ROOT / "docker-compose.yml"


def load_persisted_public_key() -> str:
    """
    Load public key from pairing credentials storage, public.pem, or environment.
    Falls back to empty string if not yet paired.
    """
    if env_key := os.getenv("PUBLIC_KEY") or os.getenv("JWT_PUBLIC_KEY"):
        return env_key

    if PAIRING_CREDENTIALS_PATH.exists():
        try:
            with open(PAIRING_CREDENTIALS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if key := data.get("public_key"):
                    return key
        except Exception:
            pass

    if PUBLIC_PEM_PATH.exists():
        try:
            with open(PUBLIC_PEM_PATH, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            pass

    return ""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV_PATH), str(BACKEND_ENV_PATH)),
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://dev:dev@localhost:5432/filestorage"
    ALGORITHM: str = "RS256"
    PUBLIC_KEY: str = load_persisted_public_key()

    REDIS_URL: str = "redis://localhost:6379"
    GENERAL_BUCKET_CAPACITY: int = 40
    GENERAL_BUCKET_REFILL_RATE: float = 1 / 2

    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str | None = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str | None = "minioadmin"

    S3_ENDPOINT_URL: str | None = "http://localhost:9002"
    S3_BUCKET_NAME: str = "cachette-files"

    MULTIPART_THRESHOLD: int = 5 * 1024 * 1024
    MAX_FILE_SIZE: int = 50 * 1024 * 1024 * 1024

    CENTRAL_URL: str = "http://localhost:9000"
    PAIRING_CREDENTIALS_FILE: str = str(PAIRING_CREDENTIALS_PATH)


settings = Settings()