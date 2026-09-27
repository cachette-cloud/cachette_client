from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class ShareCreate(BaseModel):
    access_level: Literal["view", "download"] = "view"


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_id: UUID
    access_level: str
    slug: str
    url: str
    created_at: datetime
