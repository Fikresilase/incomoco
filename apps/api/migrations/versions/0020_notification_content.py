"""add notification title and body for admin announcements"""

import sqlalchemy as sa
from alembic import op

revision = "0020_notification_content"
down_revision = "0019_human_audio_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("title", sa.String(200)))
    op.add_column("notifications", sa.Column("body", sa.Text()))


def downgrade() -> None:
    op.drop_column("notifications", "body")
    op.drop_column("notifications", "title")
