"""entrepreneur profile foundation

Revision ID: 9d4f2e6b1c77
Revises: 70bf0cde1a5a
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "9d4f2e6b1c77"
down_revision: str | None = "70bf0cde1a5a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "entrepreneur_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("identity_type", sa.String(16), server_default="guest", nullable=False),
        sa.Column("preferred_language", sa.String(8), server_default="en", nullable=False),
        sa.Column("business_name", sa.String(200)),
        sa.Column("business_description", sa.Text()),
        sa.Column("business_type", sa.String(120)),
        sa.Column("business_stage", sa.String(32)),
        sa.Column("business_location", sa.String(160)),
        sa.Column("primary_business_challenge", sa.String(240)),
        sa.Column("learning_goal", sa.String(240)),
        sa.Column("preferred_learning_format", sa.String(16)),
        sa.Column("experience_level", sa.String(16)),
        sa.Column("onboarding_completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("identity_type IN ('registered','guest')", name="ck_entrepreneur_identity_type"),
        sa.CheckConstraint("preferred_language IN ('am','om','so','en')", name="ck_entrepreneur_language"),
        sa.CheckConstraint("business_stage IN ('idea','startup','operating','growing') OR business_stage IS NULL", name="ck_entrepreneur_stage"),
        sa.CheckConstraint("preferred_learning_format IN ('text','audio','video','mixed') OR preferred_learning_format IS NULL", name="ck_entrepreneur_format"),
        sa.CheckConstraint("experience_level IN ('beginner','intermediate','advanced','unknown') OR experience_level IS NULL", name="ck_entrepreneur_experience"),
    )
    op.create_index("uq_entrepreneur_profile_session", "entrepreneur_profiles", ["session_id"], unique=True)
    op.create_index("ix_entrepreneur_profile_user", "entrepreneur_profiles", ["user_id"])
    op.create_table(
        "beneficiary_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("profile_id", sa.UUID(), nullable=False),
        sa.Column("external_system", sa.String(80), nullable=False),
        sa.Column("external_id", sa.String(160), nullable=False),
        sa.Column("verification_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("source_metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["entrepreneur_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_system", "external_id", name="uq_beneficiary_external"),
        sa.CheckConstraint("verification_status IN ('pending','verified','revoked')", name="ck_beneficiary_link_status"),
    )


def downgrade() -> None:
    op.drop_table("beneficiary_links")
    op.drop_index("ix_entrepreneur_profile_user", table_name="entrepreneur_profiles")
    op.drop_index("uq_entrepreneur_profile_session", table_name="entrepreneur_profiles")
    op.drop_table("entrepreneur_profiles")
