import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.repositories.orm import Conversation, Message


class ChatRequest(BaseModel):
    message: str | None = Field(default=None, max_length=4000)
    conversation_id: uuid.UUID | None = None
    modality: Literal["text", "dictation"] = "text"
    regenerate: bool = False

    @model_validator(mode="after")
    def _check(self) -> "ChatRequest":
        if not self.regenerate and not (self.message and self.message.strip()):
            raise ValueError("message is required")
        if self.regenerate and self.conversation_id is None:
            raise ValueError("conversation_id is required to regenerate")
        return self


class SourceOut(BaseModel):
    index: int
    document_id: str | None
    title: str
    breadcrumb: str
    page_start: int | None
    page_end: int | None
    snippet: str
    score: float


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    lang: Literal["am", "en"]
    modality: Literal["text", "dictation", "voice"]
    status: Literal["complete", "interrupted", "error"]
    no_answer: bool
    sources: list[SourceOut]
    feedback: Literal[1, -1] | None
    has_audio: bool
    created_at: datetime

    @classmethod
    def from_orm_message(cls, m: Message) -> "MessageOut":
        return cls(
            id=m.id,
            role=m.role,
            content=m.content,
            lang=m.lang,
            modality=m.modality,
            status=m.status,
            no_answer=m.no_answer,
            sources=[
                SourceOut(
                    index=s.rank,
                    document_id=str(s.document_id) if s.document_id else None,
                    title=s.title,
                    breadcrumb=s.breadcrumb,
                    page_start=s.page_start,
                    page_end=s.page_end,
                    snippet=s.snippet,
                    score=round(s.rerank_score, 4),
                )
                for s in m.sources
            ],
            feedback=m.feedback.rating if m.feedback else None,
            has_audio=m.audio is not None,
            created_at=m.created_at,
        )


class ConversationSummaryOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_conversation(cls, c: Conversation) -> "ConversationSummaryOut":
        return cls(id=c.id, title=c.title, created_at=c.created_at, updated_at=c.updated_at)


class ConversationOut(ConversationSummaryOut):
    messages: list[MessageOut]


class FeedbackIn(BaseModel):
    rating: Literal[1, -1]
    comment: str | None = Field(default=None, max_length=2000)
