"""Saved animated course preparation and learner checkpoints."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0021_animated_learning"
down_revision = "0020_notification_content"
branch_labels = depends_on = None


def upgrade():
    op.create_table("course_preparations",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("document_id", pg.UUID(), sa.ForeignKey("documents.id"), nullable=False, unique=True),
        sa.Column("owner_id", pg.UUID(), sa.ForeignKey("user_accounts.id")),
        sa.Column("organization_id", pg.UUID(), sa.ForeignKey("organizations.id")),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text()), sa.Column("plan", pg.JSONB()),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_course_preparations_status", "course_preparations", ["status"])
    op.create_table("lesson_playbacks",
        sa.Column("learner_id", pg.UUID(), primary_key=True),
        sa.Column("resource_id", pg.UUID(), sa.ForeignKey("learning_resources.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("position_ms", sa.Integer(), nullable=False),
        sa.Column("answers", pg.JSONB(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))


def downgrade():
    op.drop_table("lesson_playbacks")
    op.drop_index("ix_course_preparations_status", table_name="course_preparations")
    op.drop_table("course_preparations")
