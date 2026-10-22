import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import BusinessAction, EntrepreneurProfile, LearningSkill, SkillEvidence


@dataclass(frozen=True)
class SkillStatus:
    skill_id: uuid.UUID
    skill_key: str
    status: str
    practice_gap: bool

@dataclass(frozen=True)
class NextAction:
    type: str
    priority: str
    skill_key: str | None
    reason_code: str
    title: str
    explanation: str

class SkillStatusService:
    async def statuses(self, db: AsyncSession, profile_id: uuid.UUID) -> list[SkillStatus]:
        skills = (await db.scalars(select(LearningSkill).where(LearningSkill.active.is_(True)).order_by(LearningSkill.name))).all()
        output = []
        for skill in skills:
            evidence = (await db.scalars(select(SkillEvidence).where(SkillEvidence.profile_id == profile_id, SkillEvidence.skill_id == skill.id))).all()
            positive = sum(1 for item in evidence if item.result == "positive" or item.evidence_type in {"lesson_completed", "practice_correct", "business_action_completed"})
            negative = sum(1 for item in evidence if item.result == "negative" or item.evidence_type in {"practice_incorrect", "needs_help"})
            understands = positive >= 2 or any(item.evidence_type == "advisor_observation" and item.result == "positive" for item in evidence)
            applied = understands and any(item.evidence_type == "business_action_completed" for item in evidence)
            status = "applied" if applied else "understands" if understands else "needs_support" if negative >= 2 else "developing" if positive else "unknown"
            open_action = await db.scalar(select(BusinessAction).where(BusinessAction.profile_id == profile_id, BusinessAction.skill_id == skill.id, BusinessAction.status.in_(["recommended", "started", "needs_help"])))
            output.append(SkillStatus(skill.id, skill.key, status, status in {"understands", "applied"} and open_action is not None))
        return output

class NextBestActionService:
    async def recommend(self, db: AsyncSession, profile: EntrepreneurProfile) -> list[NextAction]:
        statuses = {item.skill_key: item for item in await SkillStatusService().statuses(db, profile.id)}
        actions = (await db.scalars(select(BusinessAction).where(BusinessAction.profile_id == profile.id, BusinessAction.status.in_(["recommended", "started", "needs_help"])).order_by(BusinessAction.priority.desc()))).all()
        output = []
        challenge = (profile.primary_business_challenge or "").lower()
        preferred = "cash_flow" if "cash" in challenge else "pricing" if "pric" in challenge or "margin" in challenge else "record_keeping" if "record" in challenge else None
        if preferred and preferred in statuses and statuses[preferred].status == "needs_support":
            output.append(NextAction("learn", "high", preferred, "knowledge_gap", "Continue Cash Flow Basics" if preferred == "cash_flow" else "Continue your business lesson", "This will help you understand your current business challenge."))
        for action in actions:
            skill = await db.get(LearningSkill, action.skill_id) if action.skill_id else None
            current = statuses.get(skill.key) if skill else None
            if action.status == "needs_help":
                output.append(NextAction("talk_to_advisor", "high", skill.key if skill else None, "needs_help", "Talk to an adviser", "You asked for help with this action."))
            elif current and current.practice_gap:
                output.append(NextAction("do", "high", skill.key, "practice_gap", action.title, "You understand this skill; this small action helps you apply it."))
            else:
                output.append(NextAction(action.action_type, action.priority, skill.key if skill else None, "active_action", action.title, action.description))
        return output[:3]
