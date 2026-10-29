import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.repositories.orm import AdviserQueueItem, BusinessAction, BusinessGoal, EntrepreneurProfile, utcnow
from app.services.adviser import SkillStatusService

router = APIRouter(prefix="/admin", tags=["admin: adviser"], dependencies=[Depends(require_permission("users.manage"))])

@router.get("/entrepreneurs")
async def entrepreneurs(db: AsyncSession = Depends(get_db)):
    profiles = (await db.scalars(select(EntrepreneurProfile).order_by(EntrepreneurProfile.business_name))).all()
    result = []
    for profile in profiles:
        goal = await db.scalar(select(BusinessGoal).where(BusinessGoal.profile_id == profile.id, BusinessGoal.status == "active"))
        action = await db.scalar(select(BusinessAction).where(BusinessAction.profile_id == profile.id, BusinessAction.status.in_(["recommended", "started", "needs_help"])).order_by(BusinessAction.priority.desc()))
        statuses = await SkillStatusService().statuses(db, profile.id)
        result.append({"id": str(profile.id), "name": profile.business_name or "Entrepreneur", "business": profile.business_name, "sector": profile.business_type, "language": profile.preferred_language, "stage": profile.business_stage, "goal": goal.title if goal else None, "action": action.title if action else None, "top_gap": next((item.skill_key for item in statuses if item.status == "needs_support"), None), "needs_attention": bool(action and action.status == "needs_help"), "is_demo": profile.is_demo})
    return result

@router.get("/entrepreneurs/{profile_id}")
async def entrepreneur_detail(profile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    profile = await db.get(EntrepreneurProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Entrepreneur not found")
    goals = (await db.scalars(select(BusinessGoal).where(BusinessGoal.profile_id == profile.id))).all()
    actions = (await db.scalars(select(BusinessAction).where(BusinessAction.profile_id == profile.id).order_by(BusinessAction.priority.desc()))).all()
    return {"profile": {"id": str(profile.id), "name": profile.business_name, "business_type": profile.business_type, "language": profile.preferred_language, "stage": profile.business_stage, "is_demo": profile.is_demo}, "goals": [{"title": x.title, "status": x.status, "priority": x.priority} for x in goals], "actions": [{"id": str(x.id), "title": x.title, "status": x.status, "priority": x.priority} for x in actions], "skill_status": [{"skill_id": str(item.skill_id), "skill_key": item.skill_key, "status": item.status, "practice_gap": item.practice_gap} for item in await SkillStatusService().statuses(db, profile.id)]}

@router.get("/knowledge-gaps")
async def knowledge_gaps(db: AsyncSession = Depends(get_db)):
    counts: dict[str, dict[str, int]] = {}
    for profile in (await db.scalars(select(EntrepreneurProfile))).all():
        for item in await SkillStatusService().statuses(db, profile.id):
            counts.setdefault(item.skill_key, {}).setdefault(item.status, 0)
            counts[item.skill_key][item.status] += 1
    return counts

@router.get("/adviser-queue")
async def adviser_queue(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AdviserQueueItem, EntrepreneurProfile, BusinessAction).join(EntrepreneurProfile, AdviserQueueItem.profile_id == EntrepreneurProfile.id).outerjoin(BusinessAction, AdviserQueueItem.action_id == BusinessAction.id).where(AdviserQueueItem.status != "resolved"))).all()
    return [{"id": str(item.id), "action_id": str(action.id) if action else None, "entrepreneur_id": str(profile.id), "entrepreneur": profile.business_name, "business": profile.business_type, "reason": item.reason, "priority": item.priority, "status": item.status, "suggested_action": "Contact the entrepreneur"} for item, profile, action in rows]

@router.patch("/adviser-queue/{item_id}")
async def update_queue(item_id: uuid.UUID, status: str, db: AsyncSession = Depends(get_db)):
    if status not in {"open", "reviewing", "resolved"}:
        raise HTTPException(422, "Invalid queue status")
    item = await db.get(AdviserQueueItem, item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    item.status = status
    item.updated_at = utcnow()
    item.resolved_at = utcnow() if status == "resolved" else None
    await db.commit()
    return {"id": str(item.id), "status": item.status}
