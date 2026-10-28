"""Work records and durable customer memory queue."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0018"
down_revision = "0017_amharic_content"
branch_labels = None
depends_on = None


def identity():
    return [
        sa.Column("id", UUID(), primary_key=True),
        sa.Column(
            "profile_id",
            UUID(),
            sa.ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
    ]


def stamp(name="created_at", nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade():
    op.create_table(
        "work_todos",
        *identity(),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("due_date", sa.Date()),
        stamp("completed_at", True),
        stamp(),
    )
    op.create_table(
        "business_transactions",
        *identity(),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        stamp(),
        sa.CheckConstraint("kind IN ('income','expense')", name="ck_transaction_kind"),
        sa.CheckConstraint("amount > 0", name="ck_transaction_amount"),
    )
    op.create_table(
        "business_customers",
        *identity(),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("contact", sa.String(240), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=False),
        sa.Column("follow_up_on", sa.Date()),
        stamp(),
    )
    op.create_table(
        "work_activity",
        *identity(),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("source_id", sa.String(80), unique=True, nullable=False),
        stamp(),
    )
    op.create_table(
        "customer_memories",
        sa.Column(
            "profile_id",
            UUID(),
            sa.ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("facts", JSONB(), nullable=False),
        sa.Column("suppressed", JSONB(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("synced_revision", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        stamp("corrected_at", True),
        stamp("next_sync_at", True),
        stamp("updated_at"),
    )
    op.create_table(
        "memory_jobs",
        sa.Column("message_id", UUID(), sa.ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "profile_id",
            UUID(),
            sa.ForeignKey("entrepreneur_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempts", sa.Integer(), nullable=False),
        stamp("available_at"),
        stamp(),
    )
    for table in (
        "work_todos",
        "business_transactions",
        "business_customers",
        "work_activity",
        "memory_jobs",
    ):
        op.create_index(f"ix_{table}_profile_id", table, ["profile_id"])


def downgrade():
    for table in (
        "memory_jobs",
        "customer_memories",
        "work_activity",
        "business_customers",
        "business_transactions",
        "work_todos",
    ):
        op.drop_table(table)
