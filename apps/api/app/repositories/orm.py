"""SQLAlchemy ORM models: the 11 tables in design doc §7.2."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _ts(nullable: bool = False, default: bool = True) -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True),
        nullable=nullable,
        default=utcnow if default else None,
        server_default=text("now()") if default else None,
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        CheckConstraint("device_type IN ('mobile','desktop')", name="ck_chat_sessions_device_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    device_type: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = _ts()
    last_seen_at: Mapped[datetime] = _ts()


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_session_updated", "session_id", text("updated_at DESC")),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="ck_messages_role"),
        CheckConstraint("lang IN ('am','en')", name="ck_messages_lang"),
        CheckConstraint("modality IN ('text','dictation','voice')", name="ck_messages_modality"),
        CheckConstraint("status IN ('complete','interrupted','error')", name="ck_messages_status"),
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
        Index("ix_messages_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    lang: Mapped[str] = mapped_column(String(2), nullable=False, default="en")
    modality: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="complete")
    no_answer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    first_token_ms: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    model: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = _ts()

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    sources: Mapped[list["MessageSource"]] = relationship(
        order_by="MessageSource.rank", cascade="all, delete-orphan", lazy="selectin"
    )
    feedback: Mapped["MessageFeedback | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")
    audio: Mapped["MessageAudio | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")


class MessageSource(Base):
    __tablename__ = "message_sources"
    __table_args__ = (
        Index("ix_message_sources_message", "message_id"),
        Index("ix_message_sources_document", "document_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL")
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    breadcrumb: Mapped[str] = mapped_column(Text, nullable=False, default="")
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    snippet: Mapped[str] = mapped_column(Text, nullable=False, default="")
    rerank_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    __table_args__ = (CheckConstraint("rating IN (1,-1)", name="ck_message_feedback_rating"),)

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class RetrievalTrace(Base):
    __tablename__ = "retrieval_traces"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    hyde_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    candidates: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    reranked: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    top_rerank_score: Mapped[float | None] = mapped_column(Float)
    stage_latency_ms: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = _ts()


class MessageAudio(Base):
    __tablename__ = "message_audio"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(String(8), nullable=False, default="wav")
    voice: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _ts()


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','processing','ready','failed','deleting','deleted')",
            name="ck_documents_status",
        ),
        CheckConstraint("lang IN ('am','en','mixed')", name="ck_documents_lang"),
        Index("ix_documents_status", "status"),
        Index(
            "uq_documents_checksum_active",
            "checksum",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime: Mapped[str] = mapped_column(String(160), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    lang: Mapped[str | None] = mapped_column(String(8))
    page_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = _ts()
    processed_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    deleted_at: Mapped[datetime | None] = _ts(nullable=True, default=False)


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"
    __table_args__ = (
        CheckConstraint("type IN ('ingest','delete')", name="ck_ingestion_jobs_type"),
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed')", name="ck_ingestion_jobs_status"
        ),
        Index("ix_ingestion_jobs_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts()
    started_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    finished_at: Mapped[datetime | None] = _ts(nullable=True, default=False)


class GapReport(Base):
    __tablename__ = "gap_reports"

    id: Mapped[uuid.UUID] = _uuid_pk()
    period_days: Mapped[int] = mapped_column(Integer, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    topics: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = _ts()


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_created", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = _ts()
