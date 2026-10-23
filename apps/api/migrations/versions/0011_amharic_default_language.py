"""make Amharic the default entrepreneur language"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "7f2b5c9d1e33"
down_revision = "6e1a4b8c2d77"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("entrepreneur_profiles", "preferred_language", server_default=sa.text("'am'"))


def downgrade() -> None:
    op.alter_column("entrepreneur_profiles", "preferred_language", server_default=sa.text("'en'"))
