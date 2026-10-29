from typing import Literal

from pydantic import BaseModel, Field, model_validator


class QuestionPlan(BaseModel):
    type: Literal["multiple_choice", "true_false"]
    question: str = Field(min_length=5, max_length=1000)
    options: list[str] = Field(min_length=2, max_length=5)
    answer: int = Field(ge=0)
    explanation: str = Field(min_length=5, max_length=2000)

    @model_validator(mode="after")
    def valid_answer(self):
        if self.answer >= len(self.options) or len(set(self.options)) != len(self.options):
            raise ValueError("Question needs distinct options and a valid answer")
        if self.type == "true_false" and len(self.options) != 2:
            raise ValueError("True/false needs two options")
        return self


class ScenePlan(BaseModel):
    scene_title: str = Field(min_length=1, max_length=100)
    story: str = Field(min_length=15, max_length=2200)
    scene_description: str = Field(min_length=20, max_length=5000)
    source_excerpt: str = Field(min_length=10, max_length=2500)
    checkpoint: QuestionPlan | None = None


class LessonPlan(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(min_length=10, max_length=1500)
    scenes: list[ScenePlan] = Field(min_length=3, max_length=8)

    @model_validator(mode="after")
    def has_checks(self):
        kinds = {s.checkpoint.type for s in self.scenes if s.checkpoint}
        if kinds != {"multiple_choice", "true_false"}:
            raise ValueError("Each lesson needs multiple choice and true/false checkpoints")
        return self


class CoursePlan(BaseModel):
    skill_key: str | None = None
    title: str = Field(min_length=1, max_length=240)
    visual_bible: str = Field(min_length=20, max_length=4000)
    lessons: list[LessonPlan] = Field(min_length=1, max_length=6)


class PositionIn(BaseModel):
    version: str = Field(min_length=1, max_length=40)
    position_ms: int = Field(ge=0)


class AnswerIn(PositionIn):
    checkpoint_id: str = Field(min_length=1, max_length=80)
    option: int = Field(ge=0, le=4)
