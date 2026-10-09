import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.repositories.orm import Document


class LoginIn(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=200)


class AdminOut(BaseModel):
    username: str


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    filename: str
    mime: str
    size_bytes: int
    lang: Literal["am", "en", "mixed"] | None
    page_count: int | None
    status: Literal["queued", "processing", "ready", "failed", "deleting", "deleted"]
    chunk_count: int
    error: str | None
    uploaded_at: datetime
    processed_at: datetime | None

    @classmethod
    def from_orm_document(cls, d: Document) -> "DocumentOut":
        return cls(
            id=d.id,
            title=d.title,
            filename=d.filename,
            mime=d.mime,
            size_bytes=d.size_bytes,
            lang=d.lang,
            page_count=d.page_count,
            status=d.status,
            chunk_count=d.chunk_count,
            error=d.error,
            uploaded_at=d.uploaded_at,
            processed_at=d.processed_at,
        )


class DocumentPage(BaseModel):
    items: list[DocumentOut]
    total: int


class Kpis(BaseModel):
    conversations: int
    messages: int
    unique_sessions: int
    documents_ready: int
    feedback_positive_rate: float | None
    no_answer_rate: float | None
    low_confidence_rate: float | None
    p50_first_token_ms: int | None
    p95_first_token_ms: int | None
    p95_voice_turn_ms: int | None
    error_rate: float | None


class DayCount(BaseModel):
    date: str
    conversations: int
    messages: int


class DayFeedback(BaseModel):
    date: str
    positive: int
    negative: int


class DocCitations(BaseModel):
    document_id: str
    title: str
    citations: int


class DocRef(BaseModel):
    document_id: str
    title: str


class AnalyticsSummary(BaseModel):
    range_days: int
    kpis: Kpis
    timeseries: list[DayCount]
    feedback_timeseries: list[DayFeedback]
    languages: dict[Literal["am", "en"], int]
    modalities: dict[Literal["text", "dictation", "voice"], int]
    devices: dict[Literal["mobile", "desktop", "unknown"], int]
    top_documents: list[DocCitations]
    unused_documents: list[DocRef]


class GapTopic(BaseModel):
    topic: str
    count: int
    examples: list[str]


class UnansweredQuestion(BaseModel):
    question: str
    lang: Literal["am", "en"]
    created_at: str


class GapsOut(BaseModel):
    generated_at: str | None
    question_count: int
    topics: list[GapTopic]
    recent_unanswered: list[UnansweredQuestion]
