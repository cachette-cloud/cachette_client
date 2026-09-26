from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional

class UploadInitiate(BaseModel):
    filename: str
    size: int
    content_type: str
    folder_id: Optional[UUID] = None

class UploadInitiateResponse(BaseModel):
    file_id: UUID
    upload_mode: str #single or multipart
    put_url: Optional[str] = None #if single
    upload_id: Optional[str] = None #if multipart

class CompletePart(BaseModel):
    part_number: int
    etag: str

class CompleteUpload(BaseModel):
    parts: list[CompletePart]

class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    size: int 
    content_type: Optional[str]
    status: str
    created_at: datetime
    folder_id: Optional[UUID]

class FolderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    created_at: datetime
    parent_id: Optional[UUID] = None

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[UUID] = None

class ItemRename(BaseModel):
    name: str

class DownloadUrlResponse(BaseModel):
    url: str

class DirectoryListing(BaseModel):
    folder: Optional[FolderOut]
    folders: list[FolderOut]
    files: list[FileOut]