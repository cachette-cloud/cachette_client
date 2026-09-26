import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class FileShare(Base):
    __tablename__ = "file_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id = Column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=False)
    shared_with_user_id = Column(UUID(as_uuid=True), ForeignKey("user_cache.user_id"), nullable=False)
    permission = Column(String(20), default="view")  # view | download
    created_at = Column(DateTime, server_default=func.now())

    file = relationship("File", back_populates="shares")