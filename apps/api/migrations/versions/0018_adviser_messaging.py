"""add adviser assignments, private human messaging, notifications, recommendations"""

import sqlalchemy as sa
from alembic import op

revision = "0018_adviser_messaging"
down_revision = "0017_amharic_content"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for key in ("profile.read_assigned", "messaging.use", "recommendations.create"):
        op.execute(sa.text("INSERT INTO permissions (id, key) VALUES (gen_random_uuid(), :key) ON CONFLICT (key) DO NOTHING").bindparams(key=key))
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'adviser' AND p.key IN ('profile.read_assigned','messaging.use','recommendations.create')
        ON CONFLICT DO NOTHING
    """))
    op.create_table(
        "adviser_assignments",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("organization_id", sa.UUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entrepreneur_profile_id", sa.UUID(), sa.ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adviser_account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by_account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("reason", sa.String(240)),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('active','ended')", name="ck_adviser_assignment_status"),
    )
    op.create_index("ix_adviser_assignment_current", "adviser_assignments", ["organization_id", "entrepreneur_profile_id", "status"])
    op.create_index("ix_adviser_assignment_adviser", "adviser_assignments", ["adviser_account_id", "status"])
    op.create_table(
        "human_conversations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("organization_id", sa.UUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entrepreneur_profile_id", sa.UUID(), sa.ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adviser_assignment_id", sa.UUID(), sa.ForeignKey("adviser_assignments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_human_conversation_profile", "human_conversations", ["entrepreneur_profile_id", "status"])
    op.create_table(
        "human_messages",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("conversation_id", sa.UUID(), sa.ForeignKey("human_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("message_type", sa.String(16), nullable=False, server_default="text"),
        sa.Column("text_body", sa.Text()),
        sa.Column("audio_storage_key", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("message_type IN ('text','audio')", name="ck_human_message_type"),
    )
    op.create_index("ix_human_message_conversation_created", "human_messages", ["conversation_id", "created_at"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("recipient_account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("related_entity_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("recipient_account_id", "event_type", "related_entity_id", name="uq_notification_recipient_event"),
    )
    op.create_index("ix_notifications_recipient_unread", "notifications", ["recipient_account_id", "read_at"])
    op.create_table(
        "adviser_recommendations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("organization_id", sa.UUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adviser_assignment_id", sa.UUID(), sa.ForeignKey("adviser_assignments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entrepreneur_profile_id", sa.UUID(), sa.ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("adviser_account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("learning_resource_id", sa.UUID(), sa.ForeignKey("learning_resources.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("adviser_assignment_id", "learning_resource_id", name="uq_adviser_recommendation_resource"),
    )


def downgrade() -> None:
    op.drop_table("adviser_recommendations")
    op.drop_table("notifications")
    op.drop_table("human_messages")
    op.drop_table("human_conversations")
    op.drop_table("adviser_assignments")
