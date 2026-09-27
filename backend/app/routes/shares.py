import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_s3_service, rate_limit, shared_ip_limiter, get_client_ip
from app.models.file import File
from app.service.s3_service import S3Service
from app.core.jwks import verify_share_token
from app.config import get_current_node_id

logger = logging.getLogger("cachette.shares")

router = APIRouter(prefix="/shared", tags=["shared"])


@router.get("/{resource_id}", dependencies=[Depends(rate_limit(shared_ip_limiter, get_client_ip))])
async def get_shared_file(
    resource_id: str,
    token: str = Query(..., description="RS256 share access token issued by Central"),
    db: AsyncSession = Depends(get_db),
    s3: S3Service = Depends(get_s3_service),
):
    """
    Public file access endpoint for Central-authorized share links.
    Verifies the RS256 token locally without contacting Central.
    Returns generic 404 for any verification failure, non-existent file, or mismatch.
    """
    own_node_id = get_current_node_id()

    # Verify the share access token issued by Central
    payload = await verify_share_token(
        token=token,
        resource_id=resource_id,
        own_node_id=own_node_id,
    )
    if not payload:
        # Generic 404: do not leak whether token, signature, expiry, or claims failed
        raise HTTPException(status_code=404, detail="File not found")

    # Look up file metadata from node database
    try:
        file_uuid = uuid.UUID(str(resource_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="File not found")

    file_row = await db.get(File, file_uuid)
    if not file_row or file_row.status != "active":
        raise HTTPException(status_code=404, detail="File not found")

    # Verify object existence in S3/MinIO
    if not await s3.object_exists(key=file_row.s3_key):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine Content-Disposition based on permission claim
    permission = payload.get("permission", "view")
    if permission == "download":
        disposition = f'attachment; filename="{file_row.filename}"'
    else:
        disposition = "inline"

    content_type = file_row.content_type or "application/octet-stream"

    headers = {
        "Content-Disposition": disposition,
        "Accept-Ranges": "bytes",
    }
    if file_row.size:
        headers["Content-Length"] = str(file_row.size)

    stream = s3.get_object_stream(key=file_row.s3_key)

    return StreamingResponse(
        stream,
        media_type=content_type,
        headers=headers,
    )
