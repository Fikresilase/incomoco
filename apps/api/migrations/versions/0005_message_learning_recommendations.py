"""persist learning recommendations on assistant messages

Revision ID: 8c1d7e4a5b22
Revises: 6f3a1c8b2d44
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "8c1d7e4a5b22"
down_revision: str | None = "6f3a1c8b2d44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("learning_recommendations", sa.JSON(), server_default=sa.text("'[]'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("messages", "learning_recommendations")
