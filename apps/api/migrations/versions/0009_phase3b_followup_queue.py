"""phase 3B follow-up progress and adviser queue"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "5d9f3c2a7e66"
down_revision = "4c8e2b1d6f55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
def upgrade() -> None:
    op.add_column("business_actions", sa.Column("target_count", sa.Integer()))
    op.add_column("business_actions", sa.Column("progress_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("business_actions", sa.Column("progress_unit", sa.String(32)))
    op.add_column("business_actions", sa.Column("last_progress_date", sa.DateTime(timezone=True)))
    op.execute(sa.text("UPDATE business_actions SET target_count = 7, progress_count = 3, progress_unit = 'days' WHERE title ILIKE '%expense%'"))
    op.create_table("adviser_queue_items", sa.Column("id", sa.UUID(), nullable=False), sa.Column("profile_id", sa.UUID(), nullable=False), sa.Column("action_id", sa.UUID()), sa.Column("reason", sa.String(80), nullable=False), sa.Column("priority", sa.String(16), server_default="medium", nullable=False), sa.Column("status", sa.String(16), server_default="open", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("resolved_at", sa.DateTime(timezone=True)), sa.ForeignKeyConstraint(["profile_id"], ["entrepreneur_profiles.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["action_id"], ["business_actions.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_adviser_queue_status_priority", "adviser_queue_items", ["status", "priority"])
def downgrade() -> None:
    op.drop_index("ix_adviser_queue_status_priority", table_name="adviser_queue_items")
    op.drop_table("adviser_queue_items")
    op.drop_column("business_actions", "last_progress_date")
    op.drop_column("business_actions", "progress_unit")
    op.drop_column("business_actions", "progress_count")
    op.drop_column("business_actions", "target_count")
