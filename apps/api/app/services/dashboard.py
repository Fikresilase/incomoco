import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import (
    BusinessAction,
    BusinessGoal,
    EntrepreneurProfile,
    LearningProgress,
    LearningResource,
    LearningSkill,
)
from app.services.entrepreneur import EntrepreneurContextService


def select_lesson_pair(resources: Iterable, progress: dict, goal_skill_ids: set[uuid.UUID]) -> tuple[object | None, object | None]:
    """Select current and next lessons from already filtered, language-matched resources."""
    eligible = [item for item in resources if item.approval_status == "approved" and item.is_active]

    def rank(item):
        state = progress.get(item.id)
        if state and state.status in {"started", "needs_review"}:
            return (0, 0 if item.skill_id in goal_skill_ids else 1, getattr(state, "last_activity_at", None))
        if item.skill_id in goal_skill_ids:
            return (1, 0, item.created_at)
        if state and state.status == "not_started":
            return (2, 0, item.created_at)
        return (3, 0, item.created_at)

    ordered = sorted(eligible, key=rank)
    current = next((item for item in ordered if progress.get(item.id) and progress[item.id].status in {"started", "needs_review"}), None)
    current = current or next((item for item in ordered if item.skill_id in goal_skill_ids and not progress.get(item.id)), None)
    next_lesson = next((item for item in ordered if item.id != getattr(current, "id", None) and (item.id not in progress or progress[item.id].status == "not_started")), None)
    return current, next_lesson


class DashboardService:
    async def lessons(self, db: AsyncSession, profile: EntrepreneurProfile):
        resources = (await db.scalars(select(LearningResource).join(LearningSkill).where(LearningResource.approval_status == "approved", LearningResource.is_active.is_(True), LearningResource.language == profile.preferred_language, LearningSkill.active.is_(True)).order_by(LearningResource.created_at))).all()
        progress = {item.resource_id: item for item in (await db.scalars(select(LearningProgress).where(LearningProgress.profile_id == profile.id))).all()}
        active_goal = await db.scalar(select(BusinessGoal).where(BusinessGoal.profile_id == profile.id, BusinessGoal.status == "active").order_by(BusinessGoal.priority.desc()))
        goal_skill_ids = set()
        if active_goal:
            goal_skill_ids = set((await db.scalars(select(BusinessAction.skill_id).where(BusinessAction.goal_id == active_goal.id, BusinessAction.skill_id.is_not(None)))).all())
        current, future = select_lesson_pair(resources, progress, goal_skill_ids)
        completed = [resource for resource in resources if progress.get(resource.id) and progress[resource.id].status == "completed"]
        return current, future, progress, completed
    async def profile_for_request(self, db: AsyncSession, session_id: uuid.UUID, demo_key: str | None = None) -> EntrepreneurProfile:
        if demo_key:
            profile = await db.scalar(select(EntrepreneurProfile).where(EntrepreneurProfile.demo_key == demo_key, EntrepreneurProfile.is_demo.is_(True)))
            if profile:
                return profile
        profile = await db.scalar(select(EntrepreneurProfile).where(EntrepreneurProfile.session_id == session_id))
        return profile or await EntrepreneurContextService().get_or_create_guest(db, session_id)

    async def dashboard(self, db: AsyncSession, profile: EntrepreneurProfile):
        goal = await db.scalar(select(BusinessGoal).where(BusinessGoal.profile_id == profile.id, BusinessGoal.status == "active").order_by(BusinessGoal.priority.desc()))
        actions = (await db.scalars(select(BusinessAction).where(BusinessAction.profile_id == profile.id, BusinessAction.status.in_(["recommended", "started", "needs_help"])).order_by(BusinessAction.priority.desc()))).all()
        return goal, actions
