import io
from datetime import timedelta

from minio import Minio
from minio.error import S3Error

from app.core.config import Settings


class MinioBlobStore:
    """BlobStorePort over MinIO (S3-compatible)."""

    def __init__(self, settings: Settings):
        self._bucket = settings.minio_bucket
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            self._bucket, key, io.BytesIO(data), length=len(data), content_type=content_type
        )

    def get(self, key: str) -> bytes:
        response = self._client.get_object(self._bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def delete(self, key: str) -> None:
        try:
            self._client.remove_object(self._bucket, key)
        except S3Error as exc:
            if exc.code != "NoSuchKey":
                raise

    def list_prefix(self, prefix: str):
        return self._client.list_objects(self._bucket, prefix=prefix, recursive=True)

    def presigned_get(self, key: str, ttl_seconds: int) -> str:
        return self._client.presigned_get_object(self._bucket, key, expires=timedelta(seconds=ttl_seconds))
