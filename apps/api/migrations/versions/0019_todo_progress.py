"""Track work to-dos in progress."""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("work_todos", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("work_todos", "started_at")
