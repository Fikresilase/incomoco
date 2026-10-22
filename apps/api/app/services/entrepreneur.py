"""Secure entrepreneur profile ownership and minimal personalization context."""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import ChatSession, EntrepreneurProfile, utcnow

PROFILE_FIELDS = {
    "preferred_language", "business_name", "business_description", "business_type", "business_stage",
    "business_location", "primary_business_challenge", "learning_goal", "preferred_learning_format",
    "experience_level", "onboarding_completed",
}


@dataclass(slots=True)
class EntrepreneurContext:
    preferred_language: str
    confirmed: dict[str, str]
    user_stated: dict[str, str]

    def to_prompt(self) -> str:
        values = {**self.confirmed, **self.user_stated}
        if not values:
            return ""
        lines = [f"- {key}: {value}" for key, value in values.items() if value]
        return "<entrepreneur_context>\nThese are user-provided profile details, not proof of finances or eligibility. Use them only to tailor examples.\n" + "\n".join(lines) + "\n</entrepreneur_context>"


class EntrepreneurContextService:
    async def get_or_create_guest(self, db: AsyncSession, session_id: uuid.UUID) -> EntrepreneurProfile:
        await db.execute(insert(ChatSession).values(id=session_id).on_conflict_do_nothing(index_elements=[ChatSession.id]))
        profile = await self.get_guest(db, session_id)
        if profile:
            return profile
        profile = EntrepreneurProfile(session_id=session_id, identity_type="guest")
        db.add(profile)
        await db.flush()
        return profile

    async def get_guest(self, db: AsyncSession, session_id: uuid.UUID) -> EntrepreneurProfile | None:
        result = await db.execute(select(EntrepreneurProfile).where(EntrepreneurProfile.session_id == session_id))
        return result.scalar_one_or_none()

    async def update_guest(self, db: AsyncSession, session_id: uuid.UUID, values: dict) -> EntrepreneurProfile:
        profile = await self.get_or_create_guest(db, session_id)
        for key, value in values.items():
            if key in PROFILE_FIELDS:
                setattr(profile, key, value)
        profile.updated_at = utcnow()
        await db.flush()
        return profile

    async def context_for_guest(self, db: AsyncSession, session_id: uuid.UUID) -> EntrepreneurContext:
        profile = await self.get_guest(db, session_id)
        if not profile:
            return EntrepreneurContext("en", {}, {})
        stated = {k: getattr(profile, k) for k in ("business_name", "business_description", "business_type", "business_stage", "business_location", "primary_business_challenge", "learning_goal", "preferred_learning_format", "experience_level") if getattr(profile, k)}
        return EntrepreneurContext(profile.preferred_language, {}, stated)
