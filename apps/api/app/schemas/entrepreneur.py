import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Lang = Literal["am", "om", "so", "en"]


class EntrepreneurProfilePatch(BaseModel):
    preferred_language: Lang | None = None
    business_name: str | None = Field(default=None, max_length=200)
    business_description: str | None = Field(default=None, max_length=2000)
    business_type: str | None = Field(default=None, max_length=120)
    business_stage: Literal["idea", "startup", "operating", "growing"] | None = None
    business_location: str | None = Field(default=None, max_length=160)
    primary_business_challenge: str | None = Field(default=None, max_length=240)
    learning_goal: str | None = Field(default=None, max_length=240)
    preferred_learning_format: Literal["text", "audio", "video", "mixed"] | None = None
    experience_level: Literal["beginner", "intermediate", "advanced", "unknown"] | None = None
    onboarding_completed: bool | None = None


class EntrepreneurProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    identity_type: Literal["registered", "guest"]
    preferred_language: Lang
    business_name: str | None
    business_description: str | None
    business_type: str | None
    business_stage: str | None
    business_location: str | None
    primary_business_challenge: str | None
    learning_goal: str | None
    preferred_learning_format: str | None
    experience_level: str | None
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime


class EntrepreneurContextOut(BaseModel):
    preferred_language: Lang
    confirmed_business_context: dict[str, str]
    user_stated_context: dict[str, str]


class GuestSessionOut(BaseModel):
    session_id: uuid.UUID
    profile: EntrepreneurProfileOut
