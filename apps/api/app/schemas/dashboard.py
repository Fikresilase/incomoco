import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ActionStatus = Literal["recommended", "started", "completed", "skipped", "needs_help"]

class DemoPersonaIn(BaseModel):
    persona: str

class GoalOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: str
    priority: str

class ActionOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    action_type: str
    status: ActionStatus
    priority: str
    due_date: datetime | None
    target_count: int | None = None
    progress_count: int = 0
    progress_unit: str | None = None

class LessonOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    language: str
    duration_seconds: int | None
    status: str
    resource_type: str

class DashboardOut(BaseModel):
    profile_id: uuid.UUID
    demo_account: bool
    profile_name: str
    business_name: str | None
    business_type: str | None
    business_stage: str | None
    language: str
    today_priority: str
    priority_reason: str
    goal: GoalOut | None
    current_action: ActionOut | None
    next_actions: list[ActionOut]
    current_lesson: LessonOut | None = None
    next_lesson: LessonOut | None = None
    completed_lessons: list[LessonOut] = []
