from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserCacheOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    display_name: Optional[str] = None
    storage_quota_bytes: int
    storage_used: int


# Backward compatibility
UserOut = UserCacheOut