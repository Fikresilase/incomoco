"""learning interaction events

Revision ID: 2a6e9c4b7d11
Revises: 8c1d7e4a5b22
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "2a6e9c4b7d11"
down_revision: str | None = "8c1d7e4a5b22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    op.create_table("learning_events", sa.Column("id", sa.UUID(), nullable=False), sa.Column("event_type", sa.String(64), nullable=False), sa.Column("session_id", sa.UUID()), sa.Column("conversation_id", sa.UUID()), sa.Column("message_id", sa.UUID()), sa.Column("resource_id", sa.UUID()), sa.Column("metadata", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="SET NULL"), sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"), sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="SET NULL"), sa.ForeignKeyConstraint(["resource_id"], ["learning_resources.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"))
    op.create_index("uq_learning_event_dedupe", "learning_events", ["event_type", "message_id", "resource_id"], unique=True)
    op.create_index("ix_learning_event_created", "learning_events", ["created_at"])

def downgrade() -> None:
    op.drop_index("ix_learning_event_created", table_name="learning_events")
    op.drop_index("uq_learning_event_dedupe", table_name="learning_events")
    op.drop_table("learning_events")
