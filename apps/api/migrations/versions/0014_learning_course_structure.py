"""Add course and chapter metadata to the existing learning resources."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0014_learning_course_structure"
down_revision = "0013_learning_journey_content"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("learning_resources", sa.Column("course_key", sa.String(80), nullable=True))
    op.add_column("learning_resources", sa.Column("chapter_number", sa.Integer(), nullable=True))
    op.create_index("ix_learning_resource_course_order", "learning_resources", ["course_key", "chapter_number"])
    op.execute(sa.text("""UPDATE learning_resources SET course_key = 'financial_basics', chapter_number = CASE
        WHEN title = 'Understand income and expenses' THEN 1
        WHEN title = 'Track daily expenses' THEN 2
        WHEN title = 'Calculate the cost of one product' THEN 3
        WHEN title = 'Understand profit' THEN 4
        WHEN title = 'Set a practical selling price' THEN 5
        WHEN title = 'Manage weekly cash flow' THEN 6
        ELSE NULL END
        WHERE content_owner = 'Inkomoko MVP sample content'"""))
    op.execute(sa.text("""UPDATE learning_resources SET course_key = CASE
        WHEN skill_id = (SELECT id FROM learning_skills WHERE key = 'customer_marketing') THEN 'customers_marketing'
        WHEN skill_id = (SELECT id FROM learning_skills WHERE key = 'business_planning') THEN 'business_planning'
        ELSE course_key END
        WHERE content_owner = 'Inkomoko MVP sample content' AND course_key IS NULL"""))


def downgrade() -> None:
    op.drop_index("ix_learning_resource_course_order", table_name="learning_resources")
    op.drop_column("learning_resources", "chapter_number")
    op.drop_column("learning_resources", "course_key")
