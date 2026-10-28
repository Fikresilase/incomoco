"""Save interactive demo lesson answers and resume position."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "demo_lesson_progress",
        sa.Column(
            "session_id", UUID(), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("persona", sa.String(64), primary_key=True),
        sa.Column("lesson_version", sa.String(40), primary_key=True),
        sa.Column("position", sa.Float(), nullable=False),
        sa.Column("answers", JSONB(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("demo_lesson_progress")
