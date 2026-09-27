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

def load_persisted_node_id() -> str:
    """
    Load node_id from environment or pairing credentials storage.
    """
    if env_node_id := os.getenv("NODE_ID"):
        return env_node_id

    if PAIRING_CREDENTIALS_PATH.exists():
        try:
            with open(PAIRING_CREDENTIALS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if node_id := data.get("node_id"):
                    return str(node_id)
        except Exception:
            pass

    return ""


def load_persisted_subdomain() -> str:
    """
    Load subdomain from environment (SUBDOMAIN or NODE_SUBDOMAIN) or pairing credentials storage.
    """
    if env_subdomain := os.getenv("SUBDOMAIN") or os.getenv("NODE_SUBDOMAIN"):
        return env_subdomain.strip()

    if PAIRING_CREDENTIALS_PATH.exists():
        try:
            with open(PAIRING_CREDENTIALS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if sub := data.get("subdomain"):
                    return str(sub).strip()
        except Exception:
            pass

    return ""


def get_current_node_id() -> str:
    if settings.NODE_ID:
        return settings.NODE_ID
    return load_persisted_node_id()


def get_current_subdomain() -> str:
    if settings.SUBDOMAIN:
        return settings.SUBDOMAIN
    return load_persisted_subdomain()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV_PATH), str(BACKEND_ENV_PATH)),
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite+aiosqlite:///./cachette.db"
    ALGORITHM: str = "RS256"
    PUBLIC_KEY: str = load_persisted_public_key()
    NODE_ID: str = load_persisted_node_id()
    SUBDOMAIN: str = load_persisted_subdomain()
    CENTRAL_JWKS_URL: str = "https://cachette.cloud/api/v1/auth/.well-known/jwks.json"

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