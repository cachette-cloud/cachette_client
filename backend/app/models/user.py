import uuid
from sqlalchemy import Column, String, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base

DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 ** 3  # 5GB free tier default


class UserCache(Base):
    __tablename__ = "user_cache"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name = Column(String(255), nullable=True)
    storage_quota_bytes = Column(
        BigInteger,
        nullable=False,
        default=DEFAULT_STORAGE_QUOTA_BYTES,
        server_default=str(DEFAULT_STORAGE_QUOTA_BYTES),
    )
    storage_used = Column(BigInteger, nullable=False, default=0, server_default="0")

    @property
    def id(self):
        return self.user_id

    def __getitem__(self, key):
        if key in ("sub", "user_id"):
            return str(self.user_id)
        if hasattr(self, key):
            return getattr(self, key)
        raise KeyError(key)

    files = relationship("File", back_populates="owner")
    folders = relationship("Folder", back_populates="owner")


# Backward-compatible alias
User = UserCache