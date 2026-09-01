from typing import Any, AsyncGenerator
import aioboto3
from botocore.exceptions import ClientError

from app.config import settings

class S3Service:
    def __init__(self) -> None:
        self.bucket = settings.S3_BUCKET_NAME

        if not self.bucket:
            raise RuntimeError("AWS_S3_BUCKET environment variable is not set.")

        self.region = settings.AWS_REGION
        self._session = aioboto3.Session()

    def _client(self):
        return self._session.client(
            "s3",
            region_name=self.region,
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )

    # ------------------------------------------------------------------
    # Multipart Upload
    # ------------------------------------------------------------------

    async def create_multipart_upload(
        self,
        *,
        key: str,
        content_type: str | None = None,
    ) -> str:
        params: dict[str, Any] = {
            "Bucket": self.bucket,
            "Key": key,
        }
        if content_type:
            params["ContentType"] = content_type

        try:
            async with self._client() as client:
                response = await client.create_multipart_upload(**params)
                return response["UploadId"]
        except ClientError as e:
            raise RuntimeError(f"Failed to create multipart upload: {e}") from e

    async def generate_part_upload_url(
        self,
        *,
        key: str,
        upload_id: str,
        part_number: int,
        expires_in: int = 900,
    ) -> str:
        try:
            async with self._client() as client:
                return await client.generate_presigned_url(
                    ClientMethod="upload_part",
                    Params={
                        "Bucket": self.bucket,
                        "Key": key,
                        "UploadId": upload_id,
                        "PartNumber": part_number,
                    },
                    ExpiresIn=expires_in,
                )
        except ClientError as e:
            raise RuntimeError(f"Failed to generate presigned upload URL: {e}") from e

    async def complete_multipart_upload(
        self,
        *,
        key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        parts must look like:
        [{"ETag": "\"abc123\"", "PartNumber": 1}, {"ETag": "\"def456\"", "PartNumber": 2}, ...]
        """
        try:
            async with self._client() as client:
                return await client.complete_multipart_upload(
                    Bucket=self.bucket,
                    Key=key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                )
        except ClientError as e:
            raise RuntimeError(f"Failed to complete multipart upload: {e}") from e

    async def abort_multipart_upload(
        self,
        *,
        key: str,
        upload_id: str,
    ) -> None:
        try:
            async with self._client() as client:
                await client.abort_multipart_upload(
                    Bucket=self.bucket,
                    Key=key,
                    UploadId=upload_id,
                )
        except ClientError as e:
            raise RuntimeError(f"Failed to abort multipart upload: {e}") from e

    # ------------------------------------------------------------------
    # Downloads
    # ------------------------------------------------------------------

    async def generate_download_url(
        self,
        *,
        key: str,
        expires_in: int = 3600,
    ) -> str:
        try:
            async with self._client() as client:
                return await client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={
                        "Bucket": self.bucket,
                        "Key": key,
                    },
                    ExpiresIn=expires_in,
                )
        except ClientError as e:
            raise RuntimeError(f"Failed to generate download URL: {e}") from e

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete_object(self, *, key: str) -> None:
        try:
            async with self._client() as client:
                await client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError as e:
            raise RuntimeError(f"Failed to delete object: {e}") from e

    # ------------------------------------------------------------------
    # Exists
    # ------------------------------------------------------------------

    async def object_exists(self, *, key: str) -> bool:
        try:
            async with self._client() as client:
                await client.head_object(Bucket=self.bucket, Key=key)
                return True
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey", "NotFound"):
                return False
            raise RuntimeError(f"Failed to check object existence: {e}") from e

    # ------------------------------------------------------------------
    # Update the object
    # ------------------------------------------------------------------

    async def generate_put_url(
        self,
        *,
        key: str,
        content_type: str,
        expires_in: int = 3600,
    ) -> str:
        try:
            async with self._client() as client:
                return await client.generate_presigned_url(
                    "put_object",
                Params = {
                    "Bucket": self.bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn = expires_in,
            )
        except ClientError as e:
            raise RuntimeError(f"Failed to generate put URL: {e}") from e

    async def put_object_bytes(
        self,
        *,
        key: str,
        content_type: str,
        body: bytes,
    ) -> None:
        try:
            async with self._client() as client:
                await client.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    ContentType=content_type,
                    Body=body,
                )
        except ClientError as e:
            raise RuntimeError(f"Failed to put object: {e}") from e

    # ------------------------------------------------------------------
    # Upload file
    # ------------------------------------------------------------------

    async def upload_file(
        self,
        *,
        key: str,
        content_type: str,
        body: bytes,
    ) -> None:
        try:
            async with self._client() as client:
                await client.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    ContentType=content_type,
                    Body=body,
                )
        except ClientError as e:
            raise RuntimeError(f"Failed to upload file: {e}") from e

    async def upload_part_bytes(
        self,
        *,
        key: str,
        upload_id: str,
        part_number: int,
        body: bytes,
    ) -> str:
        try:
            async with self._client() as client:
                response = await client.upload_part(
                    Bucket=self.bucket,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=part_number,
                    Body=body,
                )
                return response["ETag"]
        except ClientError as e:
            raise RuntimeError(f"Failed to upload part: {e}") from e

    # ------------------------------------------------------------------
    # Download file
    # ------------------------------------------------------------------

    async def get_object_stream(
        self,
        *,
        key: str,
        expires_in: int = 3600,
    ) -> AsyncGenerator[bytes, None]:
        try:
            async with self._client() as client:
                response = await client.get_object(
                    Bucket=self.bucket,
                    Key=key,
                )
                async for chunk in response["Body"]:
                    yield chunk
        except ClientError as e:
            raise RuntimeError(f"Failed to get object: {e}") from e


s3_service = S3Service()