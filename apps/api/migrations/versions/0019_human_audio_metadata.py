"""store validated human audio metadata for private playback and cleanup"""

import sqlalchemy as sa
from alembic import op

revision = "0019_human_audio_metadata"
down_revision = "0018_adviser_messaging"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("human_messages", sa.Column("audio_content_type", sa.String(80)))
    op.add_column("human_messages", sa.Column("audio_duration_seconds", sa.Float()))


def downgrade() -> None:
    op.drop_column("human_messages", "audio_duration_seconds")
    op.drop_column("human_messages", "audio_content_type")
