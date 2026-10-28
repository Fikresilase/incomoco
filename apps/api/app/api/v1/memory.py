from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, session_id_from
from app.repositories.orm import MemoryJob, utcnow
from app.services.entrepreneur import EntrepreneurContextService
from app.services.memory import ensure_memory, render_memory

router = APIRouter(prefix="/me/memory", tags=["memory"])
MemoryKey = Literal[
    "business_name",
    "business_type",
    "business_location",
    "business_goal",
    "business_challenge",
    "learning_preferences",
    "personal_context",
]


class MemoryEdit(BaseModel):
    revision: int = Field(ge=0)
    key: MemoryKey | None = None
    value: str | None = Field(default=None, max_length=1200)
    enabled: bool | None = None
    forget_all: bool = False


async def current(db, request):
    profile = await EntrepreneurContextService().get_or_create_guest(db, session_id_from(request))
    return await ensure_memory(db, profile.id)


def public(memory):
    return {
        "facts": memory.facts,
        "revision": memory.revision,
        "enabled": memory.enabled,
        "suppressed": memory.suppressed,
        "synced": memory.synced_revision == memory.revision,
        "markdown": render_memory(memory),
    }


@router.get("")
async def get_memory(request: Request, db: AsyncSession = Depends(get_db)):
    memory = await current(db, request)
    counts = (
        await db.execute(
            select(
                func.count(MemoryJob.message_id),
                func.count(MemoryJob.message_id).filter(MemoryJob.attempts >= 5),
            ).where(MemoryJob.profile_id == memory.profile_id)
        )
    ).one()
    result = {**public(memory), "pending": counts[0], "failed": counts[1]}
    await db.commit()
    return result


@router.patch("")
async def edit_memory(body: MemoryEdit, request: Request, db: AsyncSession = Depends(get_db)):
    memory = await current(db, request)
    if body.revision != memory.revision:
        raise HTTPException(409, "Memory changed. Refresh before saving your correction.")
    facts, suppressed = dict(memory.facts), set(memory.suppressed)
    if body.forget_all:
        from app.services.memory import MEMORY_KEYS

        facts, suppressed = {}, set(MEMORY_KEYS)
    if body.key:
        value = (body.value or "").strip()
        if value:
            facts[body.key] = {"value": value, "source": "user_edit", "updated_at": utcnow().isoformat()}
            suppressed.discard(body.key)
        else:
            facts.pop(body.key, None)
            suppressed.add(body.key)
    if body.enabled is not None:
        memory.enabled = body.enabled
    memory.facts, memory.suppressed = facts, sorted(suppressed)
    memory.next_sync_at = None
    memory.revision += 1
    memory.corrected_at = memory.updated_at = utcnow()
    await db.commit()
    return public(memory)


@router.post("/retry", status_code=204)
async def retry_memory(request: Request, db: AsyncSession = Depends(get_db)):
    memory = await current(db, request)
    await db.execute(
        update(MemoryJob)
        .where(MemoryJob.profile_id == memory.profile_id, MemoryJob.attempts >= 5)
        .values(attempts=0, available_at=utcnow())
    )
    await db.commit()
