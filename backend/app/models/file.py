import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Index, Uuid
from sqlalchemy.orm import relationship
from app.db.base import Base


class File(Base):
    __tablename__ = "files"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(Uuid(as_uuid=True), ForeignKey("user_cache.user_id"), nullable=False)
    s3_key = Column(String(500), nullable=False)
    filename = Column(String(255), nullable=False)
    size = Column(Integer)
    content_type = Column(String(100))
    status = Column(String(20), default="pending")
    upload_id = Column(String(255), nullable=True)
    folder_id = Column(Uuid(as_uuid=True), ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    owner = relationship("UserCache", back_populates="files")
    shares = relationship("FileShare", back_populates="file")
    folder = relationship("Folder", back_populates="files")
    share_links = relationship("ShareLink", back_populates="file")

    __table_args__ = (
        Index("ix_files_owner_id", "owner_id"),
    )