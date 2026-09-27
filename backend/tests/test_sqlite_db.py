import uuid
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from app.db.session import engine, AsyncSessionLocal
from app.models.user import UserCache
from app.models.folder import Folder
from app.models.file import File


@pytest.mark.asyncio
async def test_sqlite_pragmas_and_connectivity():
    """Verify engine connects and SQLite pragmas (foreign keys, WAL mode) are enforced."""
    async with engine.connect() as conn:
        res = await conn.execute(text("PRAGMA foreign_keys"))
        fk_enabled = res.scalar()
        assert fk_enabled == 1

        res = await conn.execute(text("PRAGMA journal_mode"))
        journal = res.scalar()
        assert journal.lower() in ("wal", "memory")


@pytest.mark.asyncio
async def test_sqlite_crud_and_uuid_handling():
    """Verify that UserCache, Folder, and File CRUD work with native Python UUIDs."""
    async with AsyncSessionLocal() as session:
        # Create user
        user_id = uuid.uuid4()
        user = UserCache(
            user_id=user_id,
            display_name="SQLite Test User",
            storage_quota_bytes=10 * 1024 * 1024,
            storage_used=0,
        )
        session.add(user)
        await session.commit()

        # Create folder
        folder_id = uuid.uuid4()
        folder = Folder(
            id=folder_id,
            owner_id=user_id,
            name="Documents",
        )
        session.add(folder)
        await session.commit()

        # Create file
        file_id = uuid.uuid4()
        file = File(
            id=file_id,
            owner_id=user_id,
            folder_id=folder_id,
            filename="notes.txt",
            s3_key=f"users/{user_id}/{file_id}",
            size=1024,
            content_type="text/plain",
            status="active",
        )
        session.add(file)
        await session.commit()

        # Query back and verify UUID types
        stmt = select(File).where(File.id == file_id)
        result = await session.execute(stmt)
        fetched_file = result.scalars().first()

        assert fetched_file is not None
        assert fetched_file.id == file_id
        assert isinstance(fetched_file.id, uuid.UUID)
        assert fetched_file.owner_id == user_id
        assert fetched_file.filename == "notes.txt"
        assert fetched_file.created_at is not None

        # Clean up
        await session.delete(file)
        await session.delete(folder)
        await session.delete(user)
        await session.commit()


@pytest.mark.asyncio
async def test_sqlite_foreign_key_enforcement():
    """Verify that inserting a file with a non-existent owner_id fails due to FK violation."""
    async with AsyncSessionLocal() as session:
        orphan_file = File(
            id=uuid.uuid4(),
            owner_id=uuid.uuid4(),  # Non-existent user
            filename="orphan.txt",
            s3_key="users/orphan/file",
            size=100,
            content_type="text/plain",
            status="active",
        )
        session.add(orphan_file)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
