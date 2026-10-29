"""Remove private human-audio objects left behind by interrupted uploads."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports import BlobStorePort
from app.repositories.orm import HumanMessage, utcnow


async def cleanup_orphaned_human_audio(db: AsyncSession, blob_store: BlobStorePort, ttl_minutes: int) -> int:
    cutoff = utcnow() - timedelta(minutes=ttl_minutes)
    referenced = set((await db.scalars(select(HumanMessage.audio_storage_key).where(HumanMessage.audio_storage_key.is_not(None)))).all())
    removed = 0
    for obj in blob_store.list_prefix("human-voice/"):
        if obj.object_name in referenced or not obj.last_modified or obj.last_modified >= cutoff:
            continue
        blob_store.delete(obj.object_name)
        removed += 1
    return removed
