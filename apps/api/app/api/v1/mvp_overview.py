"""Organization-scoped management overview for the entrepreneur MVP."""

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.repositories.orm import (
    AdviserAssignment,
    AdviserRecommendation,
    BusinessAction,
    BusinessGoal,
    EntrepreneurProfile,
    HumanConversation,
    HumanMessage,
    LearningProgress,
    UserAccount,
    utcnow,
)

router = APIRouter(prefix="/admin", tags=["admin: overview"])


@router.get("/mvp-overview")
async def mvp_overview(
    account: UserAccount = Depends(require_permission("users.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Counts use registered, non-demo profiles in the caller's organization."""
    org_id = account.organization_id
    profiles = select(EntrepreneurProfile.id).where(
        EntrepreneurProfile.organization_id == org_id,
        EntrepreneurProfile.identity_type == "registered",
        EntrepreneurProfile.is_demo.is_(False),
    )
    profile_ids = profiles.subquery()
    active_since = utcnow() - timedelta(days=30)

    async def count(statement):
        return int((await db.scalar(statement)) or 0)

    total = await count(select(func.count()).select_from(profile_ids))
    assigned = await count(select(func.count(distinct(AdviserAssignment.entrepreneur_profile_id))).where(
        AdviserAssignment.organization_id == org_id,
        AdviserAssignment.status == "active",
        AdviserAssignment.entrepreneur_profile_id.in_(profiles),
    ))
    learning_active = await count(select(func.count(distinct(LearningProgress.profile_id))).where(
        LearningProgress.profile_id.in_(profiles),
        LearningProgress.last_activity_at >= active_since,
    ))
    recent_activity = union(
        select(LearningProgress.profile_id.label("profile_id")).where(
            LearningProgress.profile_id.in_(profiles),
            LearningProgress.last_activity_at >= active_since,
        ),
        select(BusinessAction.profile_id.label("profile_id")).where(
            BusinessAction.profile_id.in_(profiles),
            BusinessAction.completed_at >= active_since,
        ),
        select(HumanConversation.entrepreneur_profile_id.label("profile_id"))
        .join(HumanMessage, HumanMessage.conversation_id == HumanConversation.id)
        .where(HumanConversation.organization_id == org_id,
               HumanConversation.entrepreneur_profile_id.in_(profiles),
               HumanMessage.created_at >= active_since),
    ).subquery()
    active_entrepreneurs = await count(select(func.count()).select_from(recent_activity))
    completed_resources = await count(select(func.count()).select_from(LearningProgress).where(
        LearningProgress.profile_id.in_(profiles),
        LearningProgress.status == "completed",
    ))
    active_goals = await count(select(func.count()).select_from(BusinessGoal).where(
        BusinessGoal.profile_id.in_(profiles), BusinessGoal.status == "active",
    ))
    completed_actions = await count(select(func.count()).select_from(BusinessAction).where(
        BusinessAction.profile_id.in_(profiles), BusinessAction.status == "completed",
    ))
    needs_follow_up = await count(select(func.count(distinct(BusinessAction.profile_id))).where(
        BusinessAction.profile_id.in_(profiles), BusinessAction.status == "needs_help",
    ))
    recent_messaging = await count(select(func.count(distinct(HumanConversation.entrepreneur_profile_id)))
        .join(HumanMessage, HumanMessage.conversation_id == HumanConversation.id)
        .where(HumanConversation.organization_id == org_id,
               HumanConversation.entrepreneur_profile_id.in_(profiles),
               HumanMessage.created_at >= active_since))
    recommendations = await count(select(func.count()).select_from(AdviserRecommendation).where(
        AdviserRecommendation.organization_id == org_id,
        AdviserRecommendation.entrepreneur_profile_id.in_(profiles),
    ))
    recommendations_completed = await count(select(func.count(distinct(AdviserRecommendation.id)))
        .join(LearningProgress,
              (LearningProgress.profile_id == AdviserRecommendation.entrepreneur_profile_id)
              & (LearningProgress.resource_id == AdviserRecommendation.learning_resource_id))
        .where(AdviserRecommendation.organization_id == org_id,
               AdviserRecommendation.entrepreneur_profile_id.in_(profiles),
               LearningProgress.status == "completed"))
    workloads = (await db.execute(select(UserAccount.id, UserAccount.display_name, func.count(AdviserAssignment.id))
        .join(AdviserAssignment, AdviserAssignment.adviser_account_id == UserAccount.id)
        .where(AdviserAssignment.organization_id == org_id,
               AdviserAssignment.status == "active",
               AdviserAssignment.entrepreneur_profile_id.in_(profiles))
        .group_by(UserAccount.id, UserAccount.display_name)
        .order_by(UserAccount.display_name))).all()

    return {
        "organization_id": str(org_id),
        "activity_window_days": 30,
        "registered_entrepreneurs": total,
        "active_entrepreneurs": active_entrepreneurs,
        "assigned_entrepreneurs": assigned,
        "unassigned_entrepreneurs": max(total - assigned, 0),
        "learning_active_entrepreneurs": learning_active,
        "completed_learning_resources": completed_resources,
        "active_business_goals": active_goals,
        "completed_business_actions": completed_actions,
        "entrepreneurs_needing_follow_up": needs_follow_up,
        "entrepreneurs_in_recent_conversations": recent_messaging,
        "adviser_recommendations": recommendations,
        "recommendations_completed": recommendations_completed,
        "adviser_workloads": [{"id": str(adviser_id), "name": name, "assigned": number} for adviser_id, name, number in workloads],
    }
