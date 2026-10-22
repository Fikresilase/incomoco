import uuid

from pydantic import BaseModel


class SkillStatusOut(BaseModel):
    skill_id: uuid.UUID
    skill_key: str
    status: str
    practice_gap: bool

class NextActionOut(BaseModel):
    type: str
    priority: str
    skill_key: str | None
    reason_code: str
    title: str
    explanation: str
