from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func, Uuid
from sqlalchemy.orm import relationship
from app.db.base import Base


class Share(Base):
    __tablename__ = "shares"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id = Column(Uuid(as_uuid=True), ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    access_level = Column(String(20), nullable=False, default="view")  # "view" | "download"
    slug = Column(String(32), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False)

    file = relationship("File", back_populates="public_shares")
