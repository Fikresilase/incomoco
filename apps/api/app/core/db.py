from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

_settings = get_settings()
engine = (
    create_async_engine(_settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=10)
    if _settings.database_pool
    else create_async_engine(_settings.database_url, poolclass=NullPool)
)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session
