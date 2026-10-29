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

PG_HOST = os.getenv("TEST_POSTGRES_HOST", "localhost")
PG_PORT = os.getenv("TEST_POSTGRES_PORT", "5433")
MINIO_HOST = os.getenv("TEST_MINIO_HOST", "localhost")
WEAVIATE_HOST = os.getenv("TEST_WEAVIATE_HOST", "localhost")
ADMIN_DSN = f"postgresql://inkomoko:inkomoko@{PG_HOST}:{PG_PORT}/inkomoko"

# Must be set before any app module is imported (settings and the engine are created at import).
os.environ.update(
    {
        "AI_PROVIDER": "fake",
        "DATABASE_URL": f"postgresql+asyncpg://inkomoko:inkomoko@{PG_HOST}:{PG_PORT}/inkomoko_test",
        "DATABASE_POOL": "false",
        "WEAVIATE_HOST": WEAVIATE_HOST,
        "WEAVIATE_HTTP_PORT": os.getenv("TEST_WEAVIATE_PORT", "8081"),
        "WEAVIATE_GRPC_PORT": os.getenv("TEST_WEAVIATE_GRPC_PORT", "50052"),
        "WEAVIATE_COLLECTION": "TestChunk",
        "MINIO_ENDPOINT": f"{MINIO_HOST}:{os.getenv('TEST_MINIO_PORT', '9010')}",
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


async def _seed_test_admin() -> None:
    import uuid

    import asyncpg
    import bcrypt

    conn = await asyncpg.connect(os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://"))
    try:
        organization_id = uuid.uuid4()
        await conn.execute("INSERT INTO organizations (id, name, slug) VALUES ($1, 'Test Inkomoko', 'inkomoko') ON CONFLICT (slug) DO NOTHING", organization_id)
        organization_id = await conn.fetchval("SELECT id FROM organizations WHERE slug = 'inkomoko'")
        account_id = uuid.uuid4()
        await conn.execute("INSERT INTO user_accounts (id, email, password_hash, display_name, organization_id) VALUES ($1, 'admin', $2, 'Test Admin', $3) ON CONFLICT (email) DO NOTHING", account_id, bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode(), organization_id)
        account_id = await conn.fetchval("SELECT id FROM user_accounts WHERE email = 'admin'")
        role_id = await conn.fetchval("SELECT id FROM roles WHERE name = 'admin'")
        await conn.execute("INSERT INTO account_roles (account_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", account_id, role_id)
        await conn.execute("""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT $1, p.id FROM permissions p WHERE p.key IN ('users.manage', 'reports.view')
            ON CONFLICT DO NOTHING
        """, role_id)
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
    if PG_HOST == "localhost" and not all(_reachable(p) for p in ports):
        pytest.skip("Docker services not running (docker compose up -d postgres weaviate minio)")

    asyncio.run(_recreate_test_db())
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=Path(__file__).resolve().parents[1],
        env=os.environ.copy(),
        check=True,
        capture_output=True,
    )
    asyncio.run(_seed_test_admin())
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
