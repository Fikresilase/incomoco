import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission, strict_account
from app.api.v1.learning import _resource_out
from app.repositories.audit_repo import record_audit
from app.repositories.orm import LearningResource, LearningSkill, UserAccount, utcnow
from app.schemas.learning import LearningResourceOut, LearningSkillOut
from app.schemas.learning_admin import ResourceIn, ResourceStatusIn, SkillIn

router = APIRouter(prefix="/admin/learning", tags=["admin: learning"], dependencies=[Depends(require_permission("users.manage"))])

VALID_TRANSITIONS = {"draft": {"draft", "review"}, "review": {"review", "approved", "draft"}, "approved": {"approved", "archived"}, "archived": {"archived", "draft"}}

@router.post("/skills", response_model=LearningSkillOut)
async def create_skill(body: SkillIn, db: AsyncSession = Depends(get_db)):
    skill = LearningSkill(**body.model_dump())
    db.add(skill)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Skill key already exists") from exc
    return LearningSkillOut.model_validate(skill, from_attributes=True)

@router.patch("/skills/{skill_id}", response_model=LearningSkillOut)
async def update_skill(skill_id: uuid.UUID, body: SkillIn, db: AsyncSession = Depends(get_db)):
    skill = await db.get(LearningSkill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    for key, value in body.model_dump().items():
        setattr(skill, key, value)
    skill.updated_at = utcnow()
    await db.commit()
    return LearningSkillOut.model_validate(skill, from_attributes=True)

@router.get("/skills", response_model=list[LearningSkillOut])
async def admin_skills(db: AsyncSession = Depends(get_db)):
    return [LearningSkillOut.model_validate(x, from_attributes=True) for x in (await db.scalars(select(LearningSkill).order_by(LearningSkill.name))).all()]

@router.post("/resources", response_model=LearningResourceOut)
async def create_resource(body: ResourceIn, db: AsyncSession = Depends(get_db)):
    if not await db.get(LearningSkill, body.skill_id):
        raise HTTPException(422, "Skill not found")
    resource = LearningResource(**body.model_dump(), approval_status="draft")
    db.add(resource)
    await db.commit()
    await db.refresh(resource)
    return await _resource_out(db, resource)

@router.get("/resources")
async def admin_resources(db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(LearningResource).order_by(LearningResource.updated_at.desc()))).all()
    return [{**(await _resource_out(db, resource)).model_dump(mode="json"), "storage_reference": resource.storage_reference, "approval_status": resource.approval_status, "is_active": resource.is_active, "is_demo": resource.is_demo, "skill_id": str(resource.skill_id), "content_owner": resource.content_owner} for resource in rows]

@router.patch("/resources/{resource_id}", response_model=LearningResourceOut)
async def update_resource(resource_id: uuid.UUID, body: ResourceIn, db: AsyncSession = Depends(get_db)):
    resource = await db.get(LearningResource, resource_id)
    if not resource:
        raise HTTPException(404, "Resource not found")
    if not await db.get(LearningSkill, body.skill_id):
        raise HTTPException(422, "Skill not found")
    for key, value in body.model_dump().items():
        setattr(resource, key, value)
    resource.updated_at = utcnow()
    await db.commit()
    await db.refresh(resource)
    return await _resource_out(db, resource)

@router.patch("/resources/{resource_id}/status", response_model=LearningResourceOut)
async def update_resource_status(resource_id: uuid.UUID, body: ResourceStatusIn, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    resource = await db.get(LearningResource, resource_id)
    if not resource:
        raise HTTPException(404, "Resource not found")
    if body.approval_status not in VALID_TRANSITIONS[resource.approval_status]:
        raise HTTPException(409, "Invalid approval transition")
    resource.approval_status = body.approval_status
    if body.is_active is not None:
        resource.is_active = body.is_active
    resource.updated_at = utcnow()
    await record_audit(db, "learning.resource.status", entity_type="learning_resource", entity_id=resource.id, actor=account.email, status=body.approval_status)
    await db.commit()
    return await _resource_out(db, resource)

@router.get("/coverage")
async def coverage(db: AsyncSession = Depends(get_db)):
    rows = await db.execute(select(LearningSkill.key, LearningResource.language, LearningResource.resource_type).join(LearningResource, LearningResource.skill_id == LearningSkill.id).where(LearningSkill.active.is_(True), LearningResource.approval_status == "approved", LearningResource.is_active.is_(True)))
    result: dict[str, dict[str, list[str]]] = {}
    for skill, language, resource_type in rows:
        result.setdefault(skill, {}).setdefault(language, []).append(resource_type)
    return result
