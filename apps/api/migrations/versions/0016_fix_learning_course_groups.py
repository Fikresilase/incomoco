"""Correct course grouping for representative learning paths."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0016_fix_learning_course_groups"
down_revision = "0015_learning_lesson_content"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""UPDATE learning_resources r SET course_key = 'customers_marketing'
        FROM learning_skills s WHERE r.skill_id = s.id AND s.key = 'customer_marketing'
        AND r.content_owner = 'Inkomoko MVP sample content'"""))
    conn.execute(sa.text("""UPDATE learning_resources r SET course_key = 'business_planning'
        FROM learning_skills s WHERE r.skill_id = s.id AND s.key = 'business_planning'
        AND r.content_owner = 'Inkomoko MVP sample content'"""))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""UPDATE learning_resources r SET course_key = 'financial_basics'
        FROM learning_skills s WHERE r.skill_id = s.id AND s.key IN ('customer_marketing', 'business_planning')
        AND r.content_owner = 'Inkomoko MVP sample content'"""))
