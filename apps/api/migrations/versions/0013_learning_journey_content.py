"""Seed the first structured entrepreneur learning journeys.

All rows are explicitly marked demo content so trainers can replace or approve
them through the existing learning administration workflow.
"""
from collections.abc import Sequence
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0013_learning_journey_content"
down_revision = "0012_security_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


FINANCIAL = [
    ("Understand income and expenses", "Learn the difference between money coming into a small business and money going out. Example: a cafe records ETB 1,200 in sales and ETB 450 for ingredients separately.", 8),
    ("Track daily expenses", "Practice a simple daily record: date, item, amount in ETB, and reason. A shop owner writes down transport, packaging, and stock costs before closing.", 7),
    ("Calculate the cost of one product", "Add the ingredients or stock cost used for one item. If five sandwiches use ETB 300 of ingredients, each sandwich starts with a cost of ETB 60.", 9),
    ("Understand profit", "Profit is sales minus the costs needed to make or sell those products. If sales are ETB 1,000 and costs are ETB 650, the remaining ETB 350 is profit before other expenses.", 8),
    ("Set a practical selling price", "Use your product cost, other business costs, and a reasonable margin when reviewing a price. Check what customers value and record the reason for any change.", 10),
    ("Manage weekly cash flow", "Compare the money you expect to receive with payments due this week. Plan stock purchases carefully so the business can meet its important commitments.", 9),
]

OTHER = [
    ("customer_marketing", "Understand your customers", "Describe the people who buy from your business and the problem your product helps them solve.", 7),
    ("customer_marketing", "Simple local marketing", "Choose one clear message and one local channel, then ask how customers heard about you.", 8),
    ("customer_marketing", "Keep useful customer feedback", "Ask three customers one short question and record what you learn without promising results you cannot deliver.", 7),
    ("business_planning", "Define a business goal", "Turn a broad hope into one clear goal you can review each week, using your own business records.", 7),
    ("business_planning", "Plan weekly activities", "Choose two or three practical activities for the week and decide when you will review what happened.", 8),
    ("business_planning", "Review business performance", "Compare this week's sales, expenses, and customer observations with your own previous records.", 8),
]


def _resource(conn, skill_key: str, title: str, description: str, duration: int) -> None:
    conn.execute(
        sa.text(
            """INSERT INTO learning_resources
            (id, skill_id, title, description, resource_type, language,
             difficulty_level, duration_seconds, approval_status, is_active,
             is_demo, source_reference, content_owner, version)
            SELECT :id, id, :title, :description, 'text_lesson', 'en',
             'beginner', :duration, 'approved', true, true,
             'DEMO CONTENT - replace with trainer-approved material',
             'Inkomoko MVP sample content', '1.0'
            FROM learning_skills WHERE key = :skill_key
            AND NOT EXISTS (
              SELECT 1 FROM learning_resources r
              WHERE r.skill_id = learning_skills.id AND r.title = :title_check
                AND r.language = 'en'
            )"""
        ),
        {"id": uuid.uuid4(), "skill_key": skill_key, "title": title, "title_check": title, "description": description, "duration": duration * 60},
    )


def upgrade() -> None:
    conn = op.get_bind()
    for key, name, description, category in [
        ("customer_marketing", "Customers and Marketing", "Practical customer and local marketing basics.", "customers"),
        ("business_planning", "Business Planning", "Simple planning and weekly review habits.", "planning"),
    ]:
        conn.execute(
            sa.text("""INSERT INTO learning_skills (id, key, name, description, category, is_demo)
            VALUES (:id, :key, :name, :description, :category, true)
            ON CONFLICT (key) DO NOTHING"""),
            {"id": uuid.uuid4(), "key": key, "name": name, "description": description, "category": category},
        )
    for title, description, minutes in FINANCIAL:
        _resource(conn, "cash_flow" if title in {"Understand income and expenses", "Track daily expenses", "Manage weekly cash flow"} else "pricing", title, description, minutes)
    for skill_key, title, description, minutes in OTHER:
        _resource(conn, skill_key, title, description, minutes)


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM learning_resources WHERE source_reference = 'DEMO CONTENT - replace with trainer-approved material' AND content_owner = 'Inkomoko MVP sample content'"))
    conn.execute(sa.text("DELETE FROM learning_skills WHERE key IN ('customer_marketing', 'business_planning')"))
