import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, session_id_from
from app.repositories.orm import (
    AdviserQueueItem,
    BusinessAction,
    EntrepreneurProfile,
    SkillEvidence,
    UserAccount,
    utcnow,
)
from app.schemas.adviser import SkillStatusOut
from app.schemas.dashboard import ActionOut, DashboardOut, DemoPersonaIn, GoalOut, LessonOut
from app.services.adviser import NextBestActionService, SkillStatusService
from app.services.dashboard import DashboardService

router = APIRouter(tags=["dashboard"])
DEMO_COOKIE = "inkomoko_demo_key"

async def _profile(request: Request, demo_key: str | None, db: AsyncSession):
    return await DashboardService().profile_for_request(db, session_id_from(request), demo_key)

@router.post("/demo/login", response_model=DashboardOut)
async def demo_login(body: DemoPersonaIn, response: Response, request: Request, db: AsyncSession = Depends(get_db)):
    profile = await _profile(request, body.persona, db)
    if not profile.is_demo or profile.demo_key != body.persona:
        raise HTTPException(404, "Demo account not found")
    response.set_cookie(DEMO_COOKIE, body.persona, max_age=86400, httponly=True, samesite="lax")
    await db.commit()
    return await _dashboard(db, profile)

@router.get("/me/dashboard", response_model=DashboardOut)
async def get_dashboard(request: Request, demo_key: str | None = Cookie(default=None, alias=DEMO_COOKIE), db: AsyncSession = Depends(get_db)):
    return await _dashboard(db, await _profile(request, demo_key, db))

@router.get("/me/skill-status", response_model=list[SkillStatusOut])
async def skill_status(request: Request, demo_key: str | None = Cookie(default=None, alias=DEMO_COOKIE), db: AsyncSession = Depends(get_db)):
    profile = await _profile(request, demo_key, db)
    return [SkillStatusOut(skill_id=item.skill_id, skill_key=item.skill_key, status=item.status, practice_gap=item.practice_gap) for item in await SkillStatusService().statuses(db, profile.id)]

@router.get("/me/actions", response_model=list[ActionOut])
async def actions(request: Request, demo_key: str | None = Cookie(default=None, alias=DEMO_COOKIE), db: AsyncSession = Depends(get_db)):
    profile = await _profile(request, demo_key, db)
    rows = (await db.scalars(select(BusinessAction).where(BusinessAction.profile_id == profile.id).order_by(BusinessAction.priority.desc()))).all()
    return [ActionOut.model_validate(row, from_attributes=True) for row in rows]

async def _dashboard(db: AsyncSession, profile: EntrepreneurProfile):
    goal, actions = await DashboardService().dashboard(db, profile)
    current = actions[0] if actions else None
    recommendations = await NextBestActionService().recommend(db, profile)
    primary = recommendations[0] if recommendations else None
    current_lesson, next_lesson, progress, completed_resources = await DashboardService().lessons(db, profile)
    def lesson_out(resource):
        if resource is None:
            return None
        item = progress.get(resource.id)
        return LessonOut(id=resource.id, title=resource.title, description=resource.description, language=resource.language, duration_seconds=resource.duration_seconds, status=item.status if item else "not_started", resource_type=resource.resource_type)
    account = await db.get(UserAccount, profile.user_id) if profile.user_id else None
    person_name = profile.demo_key.replace("_", " ").title() if profile.is_demo and profile.demo_key else (account.display_name if account else "")
    return DashboardOut(profile_id=profile.id, demo_account=profile.is_demo, profile_name=person_name, business_name=profile.business_name, business_type=profile.business_type, business_stage=profile.business_stage, language=profile.preferred_language, today_priority=primary.title if primary else (goal.title if goal else (current.title if current else "Choose one small business step")), priority_reason=primary.explanation if primary else (goal.description if goal else (current.description if current else "Your adviser can help you choose a starting point.")), goal=GoalOut.model_validate(goal, from_attributes=True) if goal else None, current_action=ActionOut.model_validate(current, from_attributes=True) if current else None, next_actions=[ActionOut.model_validate(action, from_attributes=True) for action in actions[:3]], current_lesson=lesson_out(current_lesson), next_lesson=lesson_out(next_lesson), completed_lessons=[lesson_out(resource) for resource in completed_resources])

@router.post("/me/actions/{action_id}/{transition}", response_model=ActionOut)
async def transition_action(action_id: uuid.UUID, transition: str, request: Request, response: str | None = None, demo_key: str | None = Cookie(default=None, alias=DEMO_COOKIE), db: AsyncSession = Depends(get_db)):
    if transition == "follow-up":
        return await action_follow_up(action_id, response or "", request, demo_key, db)
    profile = await _profile(request, demo_key, db)
    action = await db.scalar(select(BusinessAction).where(BusinessAction.id == action_id, BusinessAction.profile_id == profile.id))
    if not action or transition not in {"start", "complete", "needs-help"}:
        raise HTTPException(404, "Action not found")
    action.status = {"start": "started", "complete": "completed", "needs-help": "needs_help"}[transition]
    if transition == "start":
        action.started_at = utcnow()
    if transition == "complete" and not action.completed_at:
        action.completed_at = utcnow()
        if action.skill_id:
            db.add(SkillEvidence(profile_id=profile.id, skill_id=action.skill_id, evidence_type="business_action_completed", result="positive", source_reference=str(action.id)))
    if transition == "needs-help" and action.skill_id:
        db.add(SkillEvidence(profile_id=profile.id, skill_id=action.skill_id, evidence_type="needs_help", result="negative", source_reference=str(action.id)))
        existing = await db.scalar(select(AdviserQueueItem).where(AdviserQueueItem.action_id == action.id, AdviserQueueItem.status.in_(["open", "reviewing"])))
        if not existing:
            db.add(AdviserQueueItem(profile_id=profile.id, action_id=action.id, reason="needs_help", priority="high"))
    await db.commit()
    await db.refresh(action)
    return ActionOut.model_validate(action, from_attributes=True)

@router.post("/me/actions/{action_id}/follow-up", response_model=ActionOut)
async def action_follow_up(action_id: uuid.UUID, response: str, request: Request, demo_key: str | None = Cookie(default=None, alias=DEMO_COOKIE), db: AsyncSession = Depends(get_db)):
    profile = await _profile(request, demo_key, db)
    action = await db.scalar(select(BusinessAction).where(BusinessAction.id == action_id, BusinessAction.profile_id == profile.id))
    if not action or response not in {"yes", "not_yet", "needs_help"}:
        raise HTTPException(404, "Action not found")
    today = utcnow().date()
    if response == "yes" and (not action.last_progress_date or action.last_progress_date.date() != today):
        action.progress_count += 1
        action.last_progress_date = utcnow()
        action.follow_up_at = utcnow()
        if action.skill_id:
            db.add(SkillEvidence(profile_id=profile.id, skill_id=action.skill_id, evidence_type="business_action_completed", result="positive", source_reference=str(action.id)))
        if action.target_count and action.progress_count >= action.target_count:
            action.status = "completed"
            action.completed_at = utcnow()
    elif response == "not_yet":
        action.follow_up_at = utcnow()
    else:
        action.status = "needs_help"
        if action.skill_id:
            db.add(SkillEvidence(profile_id=profile.id, skill_id=action.skill_id, evidence_type="needs_help", result="negative", source_reference=str(action.id)))
        db.add(AdviserQueueItem(profile_id=profile.id, action_id=action.id, reason="needs_help", priority="high"))
    await db.commit()
    await db.refresh(action)
    return ActionOut.model_validate(action, from_attributes=True)
