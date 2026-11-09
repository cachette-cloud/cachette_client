import logging
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import BACKEND_DIR, settings
from app.db.session import engine

log = logging.getLogger("cachette.migrations")


def _run_upgrade(connection, cfg: Config) -> None:
    cfg.attributes["connection"] = connection
    command.upgrade(cfg, "head")


async def run_alembic_migrations(target_engine: AsyncEngine = engine) -> None:
    """
    Run Alembic database migrations up to 'head' asynchronously using the given engine.
    """
    log.info("Checking and running database migrations (alembic upgrade head)...")
    alembic_ini_path = BACKEND_DIR / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    alembic_cfg.attributes["skip_logging_config"] = True

    async with target_engine.connect() as conn:
        await conn.run_sync(_run_upgrade, alembic_cfg)

    log.info("Database migrations completed successfully.")
