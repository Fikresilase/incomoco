"""multilingual voice language metadata

Revision ID: 70bf0cde1a5a
Revises: 1a12107eddea
Create Date: 2026-10-13 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "70bf0cde1a5a"
down_revision: str | None = "1a12107eddea"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("lang", sa.String(length=8), server_default="en", nullable=False))
    op.create_check_constraint("ck_conversations_lang", "conversations", "lang IN ('am','om','so','en')")

    op.drop_constraint("ck_messages_lang", "messages", type_="check")
    op.alter_column("messages", "lang", type_=sa.String(length=8), existing_nullable=False)
    op.create_check_constraint("ck_messages_lang", "messages", "lang IN ('am','om','so','en')")

    op.drop_constraint("ck_documents_lang", "documents", type_="check")
    op.create_check_constraint("ck_documents_lang", "documents", "lang IN ('am','om','so','en','mixed')")

    op.add_column("message_audio", sa.Column("lang", sa.String(length=8), server_default="en", nullable=False))
    op.add_column("message_audio", sa.Column("text_hash", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("message_audio", "text_hash")
    op.drop_column("message_audio", "lang")

    op.drop_constraint("ck_documents_lang", "documents", type_="check")
    op.create_check_constraint("ck_documents_lang", "documents", "lang IN ('am','en','mixed')")

    op.drop_constraint("ck_messages_lang", "messages", type_="check")
    op.alter_column("messages", "lang", type_=sa.String(length=2), existing_nullable=False)
    op.create_check_constraint("ck_messages_lang", "messages", "lang IN ('am','en')")

    op.drop_constraint("ck_conversations_lang", "conversations", type_="check")
    op.drop_column("conversations", "lang")
