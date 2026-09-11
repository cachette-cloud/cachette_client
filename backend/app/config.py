from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://dev:dev@localhost:5432/filestorage"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    REDIS_URL: str = "redis://localhost:6379"
    AUTH_BUCKET_CAPACITY: int = 5
    AUTH_BUCKET_REFILL_RATE: float = 1 / 60
    GENERAL_BUCKET_CAPACITY: int = 40
    GENERAL_BUCKET_REFILL_RATE: float = 1 / 2

    AWS_REGION: str = "us-east-1"

    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None

    S3_ENDPOINT_URL: str | None = None
    S3_BUCKET_NAME: str = "cachette-files"

    MULTIPART_THRESHOLD: int = 5 * 1024 * 1024
    MAX_FILE_SIZE: int = 50 * 1024 * 1024 * 1024

    RESEND_API_KEY: str = "re_dev_key"
    EMAIL_FROM: str = "noreply@cachette.cloud"

    # Node-local status and monitoring settings
    CLOUDFLARED_METRICS_URL: str = "http://localhost:2026/ready"
    STORAGE_PATH: str = "/"


settings = Settings()