import uuid
from typing import Literal

from pydantic import BaseModel, Field


class SkillIn(BaseModel):
    key: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    category: str = Field(min_length=1, max_length=80)
    level: str = Field(default="beginner", max_length=32)
    active: bool = True

class ResourceIn(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=4000)
    skill_id: uuid.UUID
    resource_type: Literal["document", "guideline", "audio", "video", "text_lesson"]
    language: Literal["am", "om", "so", "en"]
    difficulty_level: str = Field(default="beginner", max_length=32)
    media_url: str | None = None
    storage_reference: str | None = None
    document_id: uuid.UUID | None = None
    source_reference: str | None = None
    content_owner: str | None = None
    version: str | None = None
    duration_seconds: int | None = None
    is_demo: bool = True
    is_active: bool = False

class ResourceStatusIn(BaseModel):
    approval_status: Literal["draft", "review", "approved", "archived"]
    is_active: bool | None = None
