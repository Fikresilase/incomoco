import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container, get_db, session_id_from
from app.core.container import Container
from app.repositories.orm import EntrepreneurProfile, LearningEvent, LearningResource, LearningSkill
from app.schemas.learning import (
    LearningResourceOut,
    LearningSkillOut,
    RecommendationOut,
    RecommendationRequest,
)
from app.services.learning import LearningRecommendationService, public_resources

router = APIRouter(prefix="/learning", tags=["learning"])


async def _resource_out(db: AsyncSession, resource: LearningResource) -> LearningResourceOut:
    skill = await db.get(LearningSkill, resource.skill_id)
    return LearningResourceOut(
        id=resource.id, title=resource.title, description=resource.description, skill_key=skill.key if skill else "",
        resource_type=resource.resource_type, language=resource.language, difficulty_level=resource.difficulty_level,
        media_url=resource.media_url if not resource.storage_reference else None, storage_reference=None, duration_seconds=resource.duration_seconds,
        source_reference=resource.source_reference, version=resource.version, created_at=resource.created_at,
    )


@router.get("/skills", response_model=list[LearningSkillOut])
async def list_skills(db: AsyncSession = Depends(get_db)) -> list[LearningSkillOut]:
    return [LearningSkillOut.model_validate(skill, from_attributes=True) for skill in (await db.scalars(select(LearningSkill).where(LearningSkill.active.is_(True)))).all()]


@router.get("/resources", response_model=list[LearningResourceOut])
async def list_resources(
    skill: str | None = None, language: Literal["am", "om", "so", "en"] | None = None,
    resource_type: Literal["document", "guideline", "audio", "video", "text_lesson"] | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[LearningResourceOut]:
    return [await _resource_out(db, resource) for resource in await public_resources(db, skill, language, resource_type)]


@router.get("/resources/{resource_id}", response_model=LearningResourceOut)
async def get_resource(resource_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> LearningResourceOut:
    resource = await db.scalar(select(LearningResource).join(LearningSkill).where(LearningResource.id == resource_id, LearningResource.approval_status == "approved", LearningResource.is_active.is_(True), LearningSkill.active.is_(True)))
    if not resource:
        raise HTTPException(404, "Learning resource not found")
    return await _resource_out(db, resource)


@router.post("/recommendations", response_model=RecommendationOut)
async def recommend(body: RecommendationRequest, request: Request, db: AsyncSession = Depends(get_db)) -> RecommendationOut:
    profile = await db.scalar(select(EntrepreneurProfile).where(EntrepreneurProfile.session_id == session_id_from(request)))
    try:
        recommendation = await LearningRecommendationService().recommend(db, body.question, profile)
    except Exception:
        return RecommendationOut(recommended=False, skill_key=None, confidence=0, reason="", resources=[])
    return RecommendationOut(
        recommended=recommendation.recommended, skill_key=recommendation.skill_key, confidence=recommendation.confidence,
        reason=recommendation.reason, resources=[await _resource_out(db, resource) for resource in (recommendation.resources or [])],
    )


@router.post("/resources/{resource_id}/events", status_code=204)
async def record_event(resource_id: uuid.UUID, event_type: Literal["learning_recommendation_shown", "learning_resource_opened"], request: Request, message_id: uuid.UUID | None = None, conversation_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    resource = await db.scalar(select(LearningResource).join(LearningSkill).where(LearningResource.id == resource_id, LearningResource.approval_status == "approved", LearningResource.is_active.is_(True), LearningSkill.active.is_(True)))
    if not resource:
        raise HTTPException(404, "Learning resource not found")
    stmt = insert(LearningEvent).values(event_type=event_type, session_id=session_id_from(request), conversation_id=conversation_id, message_id=message_id, resource_id=resource_id, metadata_={"language": resource.language, "resource_type": resource.resource_type, "skill_id": str(resource.skill_id)}).on_conflict_do_nothing(index_elements=[LearningEvent.event_type, LearningEvent.message_id, LearningEvent.resource_id])
    await db.execute(stmt)
    await db.commit()


@router.get("/resources/{resource_id}/media")
async def access_media(resource_id: uuid.UUID, db: AsyncSession = Depends(get_db), container: Container = Depends(get_container)):
    resource = await db.scalar(select(LearningResource).join(LearningSkill).where(LearningResource.id == resource_id, LearningResource.approval_status == "approved", LearningResource.is_active.is_(True), LearningSkill.active.is_(True)))
    if not resource:
        raise HTTPException(404, "Learning resource not found")
    if not resource.storage_reference:
        raise HTTPException(404, "Private media is not configured")
    presign = getattr(container.blob_store, "presigned_get", None)
    if presign is None:
        raise HTTPException(503, "Private media access is unavailable")
    return {"media_type": resource.resource_type, "url": presign(resource.storage_reference, container.settings.learning_media_url_ttl_seconds), "expires_in": container.settings.learning_media_url_ttl_seconds}
