import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Lang = Literal["am", "om", "so", "en"]
ResourceType = Literal["document", "guideline", "audio", "video", "text_lesson"]


class LearningSkillOut(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    description: str
    category: str
    level: str


class LearningResourceOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    skill_key: str
    resource_type: ResourceType
    language: Lang
    difficulty_level: str
    media_url: str | None
    storage_reference: str | None
    duration_seconds: int | None
    course_key: str | None
    course_title: str | None = None
    chapter_number: int | None
    lesson_content: dict | None
    source_reference: str | None
    version: str | None
    created_at: datetime


class RecommendationRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


class RecommendationOut(BaseModel):
    recommended: bool
    skill_key: str | None
    confidence: float
    reason: str
    resources: list[LearningResourceOut]
