from app import dependencies
from sqlalchemy import SelectLabelStyle
from sqlalchemy import select
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user, get_s3_service, rate_limit_user, general_limiter
from app.models.user import User
from app.models.file import File
from app.models.folder import Folder
from app.schema.file import UploadInitiate, UploadInitiateResponse, CompleteUpload, CompletePart, FileOut, DirectoryListing, FolderOut, FolderCreate, ItemRename, DownloadUrlResponse
from app.service.s3_service import s3_service
from app.config import settings

router = APIRouter(prefix="/files", tags = ["files"])

@router.post("/uploads/initate", response_model = UploadInitiateResponse, dependencies=[Depends(rate_limit_user(general_limiter))])
async def initiate_upload(
    body: UploadInitiate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service),
):
    if body.size > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail = f"file exceeds max size of {settings.MAX_FILE_SIZE} bytes")
    
    existing_file = await db.execute(
        select(File).where(
            File.owner_id == current_user.id,
            File.folder_id == body.folder_id,
            File.filename == body.filename,
            File.status == "active"
        )
    )
    if existing_file.scalars().first():
        raise HTTPException(400, "A file with this name already exists in this folder")
    
    if current_user.storage_used + body.size > current_user.storage_quota_bytes:
        remaining = current_user.storage_quota_bytes - current_user.storage_used
        raise HTTPException(413, f"Storage quota exceeded. {remaining} bytes remaining")

    file_id = uuid.uuid4()
    key = f"users/{current_user.id}/{file_id}"

    fil_row = File(
        id = file_id,
        owner_id = current_user.id,
        s3_key = key,
        filename = body.filename,
        size = body.size,
        content_type = body.content_type,
        status = "uploading",
        folder_id = body.folder_id
    )
    db.add(fil_row)
    await db.commit()

    if body.size < settings.MULTIPART_THRESHOLD:
        # put_url = await s3.generate_put_url(key=key, content_type=body.content_type)
        return UploadInitiateResponse(
            file_id = file_id,
            upload_mode = "single"
        )
    else:
        upload_id = await s3.create_multipart_upload(key=key, content_type=body.content_type)
        return UploadInitiateResponse(
            file_id = file_id,
            upload_mode = "multipart",
            upload_id = upload_id
        )
    
@router.post("/{file_id}/upload", dependencies=[Depends(rate_limit_user(general_limiter))])
async def upload_single(
    file_id: uuid.UUID,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)

    if not file_row or file_row.owner_id != current_user.id:
        raise HTTPException(404, "file not found")
    if file_row.status != "uploading":
        raise HTTPException(400, "upload not in progress")
    if file_row.size > current_user.storage_quota_bytes - current_user.storage_used:
        await s3.delete_object(key=file_row.s3_key)
        await db.delete(file_row)
        await db.commit()
        raise HTTPException(413, "File size exceeds maximum allowed size")
    
    data = await file.read()
    await s3.put_object_bytes(key=file_row.s3_key, content_type=file_row.content_type, body=data)

    file_row.status = "active"
    await db.commit()

    return {"status": "uploaded"}

@router.put("/uploads/{file_id}/part", dependencies=[Depends(rate_limit_user(general_limiter))])
async def upload_part(
    file_id: uuid.UUID,
    part_number: int,
    part: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)

    if not file_row or file_row.owner_id != current_user.id:
        raise HTTPException(404, "file not found")
    if file_row.status != "uploading":
        raise HTTPException(400, "upload not in progress")

    data = await part.read()
    etag = await s3.upload_part_bytes(
        file_row.s3_key, file_row.upload_id, part_number, data
    )

    return {"part_number": part_number, "etag": etag}


@router.post("/uploads/{file_id}/part-url", dependencies = [Depends(rate_limit_user(general_limiter))])
async def get_part_url(
    file_id: uuid.UUID,
    part_number: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id:
        raise HTTPException(400, "file not found")
    if file_row.status != "uploading":
        raise HTTPException(400, "upload not in progress")

    url = await s3.generate_part_upload_url(
        file_row.s3_key,
        file_row.upload_id,
        part_number
    )

    return {"part_number": part_number, "url": url}


@router.post("/uploads/{file_id}/complete", dependencies = [Depends(rate_limit_user(general_limiter))])
async def complete_upload(
    file_id: uuid.UUID,
    body: CompleteUpload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id:
        raise HTTPException(400, "file not found")
    
    if file_row.upload_id:
        await s3.complete_multipart_upload(
            file_row.s3_key,
            file_row.upload_id,
            [{"PartNumber": p.part_number, "ETag": p.etag} for p in body.parts]
        )
    else:
       exists = await s3.object_exists(key=file_row.s3_key)
       if not exists:
           raise HTTPException(400, "File was not uploaded")

    if current_user.storage_used + file_row.size > current_user.storage_quota_bytes:
        await s3.delete_object(key=file_row.s3_key)
        await db.delete(file_row)
        await db.commit()
        raise HTTPException(403, "Storage quota exceeded")
    
    file_row.status = "active"
    current_user.storage_used += file_row.size
    await db.commit()

    return {"file_id": file_id, "status": "active"}

@router.post("/upload/{file_id}/abort", dependencies = [Depends(rate_limit_user(general_limiter))])
async def abort_upload(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id:
        raise HTTPException(404, "File not found")
    
    if file_row.upload_id:
        await s3.abort_multipart_upload(file_row.s3_key, file_row.upload_id)
    await db.delete(file_row)
    await db.commit()
    return {"status": "aborted"}
    
    
@router.delete("/{file_id}", dependencies = [Depends(rate_limit_user(general_limiter))])
async def delete_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id:
        raise HTTPException(404, "File not found")

    await s3.delete_object(key=file_row.s3_key)
    current_user.storage_used -= file_row.size
    await db.delete(file_row)
    await db.commit()
    return {"status": "deleted"}



@router.get("/{file_id}/download", response_model=DownloadUrlResponse, dependencies=[Depends(rate_limit_user(general_limiter))])
async def get_download_url(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id or file_row.status != "active":
        raise HTTPException(404, "File not found")

    stream = s3.get_object_stream(key=file_row.s3_key)

    return StreamingResponse(
        stream,
        media_type=file_row.content_type,
        headers={
            "Content-Disposition": f"attachment; filename={file_row.filename}"
        }
    )



@router.patch("/{file_id}", response_model=FileOut, dependencies=[Depends(rate_limit_user(general_limiter))])
async def rename_file(
    file_id: uuid.UUID,
    body: ItemRename,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id or file_row.status != "active":
        raise HTTPException(404, "File not found")

    # Check for duplicates in same folder
    existing_file = await db.execute(
        select(File).where(
            File.owner_id == current_user.id,
            File.folder_id == file_row.folder_id,
            File.filename == body.name,
            File.status == "active",
            File.id != file_id
        )
    )
    if existing_file.scalars().first():
        raise HTTPException(400, "A file with this name already exists in this folder")

    file_row.filename = body.name
    await db.commit()
    await db.refresh(file_row)
    return file_row

@router.post("/folders", response_model=FolderOut, dependencies=[Depends(rate_limit_user(general_limiter))])
async def create_folder(
    body: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.parent_id:
        parent_folder = await db.get(Folder, body.parent_id)
        if not parent_folder or parent_folder.owner_id != current_user.id:
            raise HTTPException(404, "Parent folder not found")

    existing_folder = await db.execute(
        select(Folder).where(
            Folder.owner_id == current_user.id,
            Folder.parent_id == body.parent_id,
            Folder.name == body.name
        )
    )
    if existing_folder.scalars().first():
        raise HTTPException(400, "A folder with this name already exists")

    new_folder = Folder(
        owner_id=current_user.id,
        parent_id=body.parent_id,
        name=body.name
    )
    db.add(new_folder)
    await db.commit()
    await db.refresh(new_folder)
    return new_folder

@router.patch("/folders/{folder_id}", response_model=FolderOut, dependencies=[Depends(rate_limit_user(general_limiter))])
async def rename_folder(
    folder_id: uuid.UUID,
    body: ItemRename,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder_row = await db.get(Folder, folder_id)
    if not folder_row or folder_row.owner_id != current_user.id:
        raise HTTPException(404, "Folder not found")

    # Check for duplicates in same parent folder
    existing_folder = await db.execute(
        select(Folder).where(
            Folder.owner_id == current_user.id,
            Folder.parent_id == folder_row.parent_id,
            Folder.name == body.name,
            Folder.id != folder_id
        )
    )
    if existing_folder.scalars().first():
        raise HTTPException(400, "A folder with this name already exists")

    folder_row.name = body.name
    await db.commit()
    await db.refresh(folder_row)
    return folder_row

@router.delete("/folders/{folder_id}", dependencies = [Depends(rate_limit_user(general_limiter))])
async def delete_folder(
    folder_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    s3: s3_service = Depends(get_s3_service)
):
    target_folder = await db.get(Folder, folder_id)
    if not target_folder or target_folder.owner_id != current_user.id:
        raise HTTPException(404, "Folder not found")

    async def delete_folder_recursive(fid: uuid.UUID):
        # 1. Get subfolders
        sub_folders_res = await db.execute(select(Folder).where(Folder.parent_id == fid))
        sub_folders = sub_folders_res.scalars().all()
        for sf in sub_folders:
            await delete_folder_recursive(sf.id)
            
        # 2. Get files in this folder
        files_res = await db.execute(select(File).where(File.folder_id == fid))
        files = files_res.scalars().all()
        
        for f in files:
            await s3.delete_object(key=f.s3_key)
            current_user.storage_used -= f.size
            await db.delete(f)
            
        # 3. Delete this folder
        curr_folder = await db.get(Folder, fid)
        if curr_folder:
            await db.delete(curr_folder)
            
    await delete_folder_recursive(folder_id)
    await db.commit()
    return {"status": "deleted"}

@router.get("", response_model=DirectoryListing, dependencies=[Depends(rate_limit_user(general_limiter))])
async def list_directory(
    folder_id: Optional[uuid.UUID] = Query(None, description="Folder to list; omit for root"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = None
    if folder_id is not None:
        folder = await db.get(Folder, folder_id)
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(404, "folder not found")
    
    #get folders in dir
    folders_result = await db.execute(
        select(Folder).where(Folder.owner_id == current_user.id, Folder.parent_id == folder_id)
    )
    subfolders = folders_result.scalars().all()

    files_result = await db.execute(
        select(File).where(
            File.owner_id == current_user.id,
            File.folder_id == folder_id,
            File.status == "active"
        )
    )
    files = files_result.scalars().all()

    return DirectoryListing(
        folder=FolderOut.model_validate(folder) if folder else None,
        folders=[FolderOut.model_validate(f) for f in subfolders],
        files=[FileOut.model_validate(f) for f in files],
    )

@router.get("/{file_id}", response_model=FileOut, dependencies=[Depends(rate_limit_user(general_limiter))])
async def get_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_row = await db.get(File, file_id)
    if not file_row or file_row.owner_id != current_user.id or file_row.status != "active":
        raise HTTPException(404, "File not found")
    return file_row