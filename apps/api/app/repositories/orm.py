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
    UniqueConstraint,
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


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    created_at: Mapped[datetime] = _ts()


class UserAccount(Base):
    __tablename__ = "user_accounts"
    __table_args__ = (UniqueConstraint("email", name="uq_user_accounts_email"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    created_at: Mapped[datetime] = _ts()


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[uuid.UUID] = _uuid_pk()
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    created_at: Mapped[datetime] = _ts()


class AccountRole(Base):
    __tablename__ = "account_roles"
    __table_args__ = (UniqueConstraint("account_id", "role_id", name="uq_account_roles"),)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permissions"),)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_account_active", "account_id", "revoked_at"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False)
    refresh_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    created_at: Mapped[datetime] = _ts()
    rotated_at: Mapped[datetime | None] = _ts(nullable=True, default=False)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        CheckConstraint("device_type IN ('mobile','desktop')", name="ck_chat_sessions_device_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    device_type: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = _ts()
    last_seen_at: Mapped[datetime] = _ts()


class EntrepreneurProfile(Base):
    __tablename__ = "entrepreneur_profiles"
    __table_args__ = (
        CheckConstraint("identity_type IN ('registered','guest')", name="ck_entrepreneur_identity_type"),
        CheckConstraint("preferred_language IN ('am','om','so','en')", name="ck_entrepreneur_language"),
        CheckConstraint("business_stage IN ('idea','startup','operating','growing') OR business_stage IS NULL", name="ck_entrepreneur_stage"),
        CheckConstraint("preferred_learning_format IN ('text','audio','video','mixed') OR preferred_learning_format IS NULL", name="ck_entrepreneur_format"),
        CheckConstraint("experience_level IN ('beginner','intermediate','advanced','unknown') OR experience_level IS NULL", name="ck_entrepreneur_experience"),
        Index("uq_entrepreneur_profile_session", "session_id", unique=True),
        Index("ix_entrepreneur_profile_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user_accounts.id", ondelete="SET NULL"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"))
    identity_type: Mapped[str] = mapped_column(String(16), nullable=False, default="guest", server_default="guest")
    preferred_language: Mapped[str] = mapped_column(String(8), nullable=False, default="am", server_default="am")
    business_name: Mapped[str | None] = mapped_column(String(200))
    business_description: Mapped[str | None] = mapped_column(Text)
    business_type: Mapped[str | None] = mapped_column(String(120))
    business_stage: Mapped[str | None] = mapped_column(String(32))
    business_location: Mapped[str | None] = mapped_column(String(160))
    primary_business_challenge: Mapped[str | None] = mapped_column(String(240))
    learning_goal: Mapped[str | None] = mapped_column(String(240))
    preferred_learning_format: Mapped[str | None] = mapped_column(String(16))
    experience_level: Mapped[str | None] = mapped_column(String(16))
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    demo_key: Mapped[str | None] = mapped_column(String(40), unique=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class BusinessGoal(Base):
    __tablename__ = "business_goals"
    __table_args__ = (CheckConstraint("status IN ('active','achieved','paused','cancelled')", name="ck_business_goal_status"), Index("ix_business_goal_profile_status", "profile_id", "status"))
    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", server_default="active")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium", server_default="medium")
    target_date: Mapped[datetime | None] = _ts(nullable=True, default=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="user", server_default="user")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()
    completed_at: Mapped[datetime | None] = _ts(nullable=True, default=False)


class BusinessAction(Base):
    __tablename__ = "business_actions"
    __table_args__ = (CheckConstraint("action_type IN ('learn','do','review','talk_to_advisor')", name="ck_business_action_type"), CheckConstraint("status IN ('recommended','started','completed','skipped','needs_help')", name="ck_business_action_status"), Index("ix_business_action_profile_status", "profile_id", "status"))
    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False)
    goal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("business_goals.id", ondelete="SET NULL"))
    skill_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_skills.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    action_type: Mapped[str] = mapped_column(String(24), nullable=False, default="do", server_default="do")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="recommended", server_default="recommended")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium", server_default="medium")
    due_date: Mapped[datetime | None] = _ts(nullable=True, default=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="system", server_default="system")
    started_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    completed_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    follow_up_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    target_count: Mapped[int | None] = mapped_column(Integer)
    progress_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    progress_unit: Mapped[str | None] = mapped_column(String(32))
    last_progress_date: Mapped[datetime | None] = _ts(nullable=True, default=False)


class AdviserQueueItem(Base):
    __tablename__ = "adviser_queue_items"
    __table_args__ = (Index("ix_adviser_queue_status_priority", "status", "priority"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False)
    action_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("business_actions.id", ondelete="SET NULL"))
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium", server_default="medium")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", server_default="open")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()
    resolved_at: Mapped[datetime | None] = _ts(nullable=True, default=False)


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (Index("uq_learning_progress_profile_resource", "profile_id", "resource_id", unique=True),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False)
    skill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_skills.id", ondelete="CASCADE"), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_resources.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="not_started", server_default="not_started")
    completion_evidence: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    completed_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    last_activity_at: Mapped[datetime] = _ts()


class SkillEvidence(Base):
    __tablename__ = "skill_evidence"
    __table_args__ = (Index("ix_skill_evidence_profile_skill", "profile_id", "skill_id", "created_at"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False)
    skill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_skills.id", ondelete="CASCADE"), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(32), nullable=False)
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    source_reference: Mapped[str | None] = mapped_column(String(240))
    created_at: Mapped[datetime] = _ts()


class BeneficiaryLink(Base):
    __tablename__ = "beneficiary_links"
    __table_args__ = (
        CheckConstraint("verification_status IN ('pending','verified','revoked')", name="ck_beneficiary_link_status"),
        Index("uq_beneficiary_external", "external_system", "external_id", unique=True),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False)
    external_system: Mapped[str] = mapped_column(String(80), nullable=False)
    external_id: Mapped[str] = mapped_column(String(160), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    last_synced_at: Mapped[datetime | None] = _ts(nullable=True, default=False)
    source_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class LearningSkill(Base):
    __tablename__ = "learning_skills"
    __table_args__ = (Index("uq_learning_skill_key", "key", unique=True), Index("ix_learning_skill_active", "active"))

    id: Mapped[uuid.UUID] = _uuid_pk()
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[str] = mapped_column(String(32), nullable=False, default="beginner", server_default="beginner")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class LearningResource(Base):
    __tablename__ = "learning_resources"
    __table_args__ = (
        CheckConstraint("resource_type IN ('document','guideline','audio','video','text_lesson')", name="ck_learning_resource_type"),
        CheckConstraint("language IN ('am','om','so','en')", name="ck_learning_resource_language"),
        CheckConstraint("approval_status IN ('draft','review','approved','archived')", name="ck_learning_resource_status"),
        Index("ix_learning_resource_public", "skill_id", "language", "approval_status", "is_active"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    skill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_skills.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    resource_type: Mapped[str] = mapped_column(String(24), nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False)
    difficulty_level: Mapped[str] = mapped_column(String(32), nullable=False, default="beginner", server_default="beginner")
    media_url: Mapped[str | None] = mapped_column(Text)
    storage_reference: Mapped[str | None] = mapped_column(Text)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"))
    source_reference: Mapped[str | None] = mapped_column(Text)
    content_owner: Mapped[str | None] = mapped_column(String(160))
    version: Mapped[str | None] = mapped_column(String(40))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    course_key: Mapped[str | None] = mapped_column(String(80))
    chapter_number: Mapped[int | None] = mapped_column(Integer)
    lesson_content: Mapped[dict | None] = mapped_column(JSONB)
    approval_status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", server_default="draft")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("lang IN ('am','om','so','en')", name="ck_conversations_lang"),
        Index("ix_conversations_session_updated", "session_id", text("updated_at DESC")),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en", server_default="en")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="ck_messages_role"),
        CheckConstraint("lang IN ('am','om','so','en')", name="ck_messages_lang"),
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
    lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    modality: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="complete")
    no_answer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    learning_recommendations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="'[]'::jsonb")
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
    lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en", server_default="en")
    voice: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    text_hash: Mapped[str | None] = mapped_column(String(64))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _ts()


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','processing','ready','failed','deleting','deleted')",
            name="ck_documents_status",
        ),
        CheckConstraint("lang IN ('am','om','so','en','mixed')", name="ck_documents_lang"),
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


class LearningEvent(Base):
    __tablename__ = "learning_events"
    __table_args__ = (Index("uq_learning_event_dedupe", "event_type", "message_id", "resource_id", unique=True), Index("ix_learning_event_created", "created_at"))

    id: Mapped[uuid.UUID] = _uuid_pk()
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="SET NULL"))
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"))
    message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"))
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("learning_resources.id", ondelete="SET NULL"))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = _ts()
