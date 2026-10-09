"""Test configuration.

Unit tests need nothing. Integration tests (marked `integration`) run against the Docker Compose
Postgres/Weaviate/MinIO on their host ports, with offline AI adapters and isolated resources:
database `inkomoko_test`, bucket `test-documents`, Weaviate collection `TestChunk`.
"""

import asyncio
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

PG_PORT = os.getenv("TEST_POSTGRES_PORT", "5433")
ADMIN_DSN = f"postgresql://inkomoko:inkomoko@localhost:{PG_PORT}/inkomoko"

# Must be set before any app module is imported (settings and the engine are created at import).
os.environ.update(
    {
        "AI_PROVIDER": "fake",
        "DATABASE_URL": f"postgresql+asyncpg://inkomoko:inkomoko@localhost:{PG_PORT}/inkomoko_test",
        "DATABASE_POOL": "false",
        "WEAVIATE_HOST": "localhost",
        "WEAVIATE_HTTP_PORT": os.getenv("TEST_WEAVIATE_PORT", "8081"),
        "WEAVIATE_GRPC_PORT": os.getenv("TEST_WEAVIATE_GRPC_PORT", "50052"),
        "WEAVIATE_COLLECTION": "TestChunk",
        "MINIO_ENDPOINT": f"localhost:{os.getenv('TEST_MINIO_PORT', '9010')}",
        "MINIO_ACCESS_KEY": "inkomoko",
        "MINIO_SECRET_KEY": "inkomoko-secret",
        "MINIO_BUCKET": "test-documents",
        "CHUNK_MIN_TOKENS": "20",
        "CHUNK_MAX_TOKENS": "120",
        "ADMIN_USERNAME": "admin",
        "ADMIN_PASSWORD": "admin123",
        "JWT_SECRET": "test-secret-that-is-long-enough-for-hs256",
    }
)


def _reachable(port: str) -> bool:
    try:
        with socket.create_connection(("localhost", int(port)), timeout=1):
            return True
    except OSError:
        return False


async def _recreate_test_db() -> None:
    import asyncpg

    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        await conn.execute("DROP DATABASE IF EXISTS inkomoko_test WITH (FORCE)")
        await conn.execute("CREATE DATABASE inkomoko_test")
    finally:
        await conn.close()


async def _drop_test_db() -> None:
    import asyncpg

    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        await conn.execute("DROP DATABASE IF EXISTS inkomoko_test WITH (FORCE)")
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def integration_env():
    ports = [
        PG_PORT,
        os.environ["WEAVIATE_HTTP_PORT"],
        os.environ["WEAVIATE_GRPC_PORT"],
        os.environ["MINIO_ENDPOINT"].split(":")[1],
    ]
    if not all(_reachable(p) for p in ports):
        pytest.skip("Docker services not running (docker compose up -d postgres weaviate minio)")

    asyncio.run(_recreate_test_db())
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=Path(__file__).resolve().parents[1],
        env=os.environ.copy(),
        check=True,
        capture_output=True,
    )
    yield

    from app.adapters.minio.blob_store import MinioBlobStore
    from app.adapters.weaviate.vector_store import WeaviateVectorStore
    from app.core.config import get_settings

    settings = get_settings()
    store = WeaviateVectorStore(settings)
    store.drop_collection()
    store.close()
    blobs = MinioBlobStore(settings)
    client = blobs._client
    if client.bucket_exists(settings.minio_bucket):
        for obj in client.list_objects(settings.minio_bucket, recursive=True):
            client.remove_object(settings.minio_bucket, obj.object_name)
        client.remove_bucket(settings.minio_bucket)
    asyncio.run(_drop_test_db())
