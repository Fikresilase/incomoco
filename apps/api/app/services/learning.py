"""Approved learning resource registry and explainable recommendation logic."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import EntrepreneurProfile, LearningResource, LearningSkill

KEYWORDS: dict[str, tuple[str, ...]] = {
    "cash_flow": ("cash flow", "money left", "no money", "cash", "cashflow", "ብር"),
    "pricing": ("price", "pricing", "profit", "margin", "ዋጋ"),
    "record_keeping": ("record", "bookkeeping", "accounts", "sales log", "ሂሳብ"),
}


@dataclass(slots=True)
class LearningRecommendation:
    recommended: bool
    skill_key: str | None = None
    confidence: float = 0.0
    reason: str = ""
    resources: list[LearningResource] | None = None

    def to_public(self) -> list[dict]:
        return [{"resource_id": str(r.id), "skill_key": self.skill_key, "title": r.title, "description": r.description, "resource_type": r.resource_type, "language": r.language, "difficulty_level": r.difficulty_level, "duration_seconds": r.duration_seconds} for r in (self.resources or [])]


class LearningRecommendationService:
    async def classify(self, question: str, profile: EntrepreneurProfile | None) -> tuple[str, float, str] | None:
        text = question.casefold()
        matches = [(key, sum(term in text for term in terms)) for key, terms in KEYWORDS.items()]
        key, count = max(matches, key=lambda item: item[1], default=(None, 0))
        if not key or count == 0:
            return None
        confidence = min(0.55 + count * 0.14, 0.92)
        reason = "The question matches an approved business learning topic."
        if profile and profile.business_type:
            reason += f" Examples can be tailored to the user's {profile.business_type} business."
        return key, confidence, reason

    async def recommend(self, db: AsyncSession, question: str, profile: EntrepreneurProfile | None) -> LearningRecommendation:
        classified = await self.classify(question, profile)
        if not classified or classified[1] < 0.65:
            return LearningRecommendation(False)
        key, confidence, reason = classified
        skill = await db.scalar(select(LearningSkill).where(LearningSkill.key == key, LearningSkill.active.is_(True)))
        if not skill:
            return LearningRecommendation(False)
        language = profile.preferred_language if profile else "en"
        preferred = profile.preferred_learning_format if profile else None
        order = {"audio": ["audio", "video", "text_lesson", "document", "guideline"], "video": ["video", "audio", "text_lesson", "document", "guideline"], "text": ["text_lesson", "document", "guideline", "audio", "video"], "mixed": ["audio", "video", "text_lesson", "document", "guideline"]}.get(preferred or "mixed", ["audio", "video", "text_lesson", "document", "guideline"])
        resources = list((await db.scalars(select(LearningResource).where(LearningResource.skill_id == skill.id, LearningResource.language == language, LearningResource.approval_status == "approved", LearningResource.is_active.is_(True)))).all())
        resources.sort(key=lambda resource: order.index(resource.resource_type) if resource.resource_type in order else len(order))
        return LearningRecommendation(bool(resources), key, confidence, reason, resources[:3])


async def public_resources(db: AsyncSession, skill: str | None = None, language: str | None = None, resource_type: str | None = None) -> list[LearningResource]:
    query = select(LearningResource).join(LearningSkill).where(LearningResource.approval_status == "approved", LearningResource.is_active.is_(True), LearningSkill.active.is_(True))
    if skill:
        query = query.where(LearningSkill.key == skill)
    if language:
        query = query.where(LearningResource.language == language)
    if resource_type:
        query = query.where(LearningResource.resource_type == resource_type)
    return list((await db.scalars(query.order_by(LearningResource.created_at.desc()))).all())
