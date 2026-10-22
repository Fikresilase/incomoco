"""learning skill and approved resource registry

Revision ID: 6f3a1c8b2d44
Revises: 9d4f2e6b1c77
"""

from collections.abc import Sequence
import uuid
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "6f3a1c8b2d44"
down_revision: str | None = "9d4f2e6b1c77"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SKILLS = [
    ("cash_flow", "Cash Flow Basics", "Demo content: replace with trainer-approved material.", "financial_management"),
    ("pricing", "Pricing and Profit", "Demo content: replace with trainer-approved material.", "financial_management"),
    ("record_keeping", "Record Keeping", "Demo content: replace with trainer-approved material.", "bookkeeping"),
]


def upgrade() -> None:
    op.create_table("learning_skills", sa.Column("id", sa.UUID(), nullable=False), sa.Column("key", sa.String(80), nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("category", sa.String(80), nullable=False), sa.Column("level", sa.String(32), server_default="beginner", nullable=False), sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False), sa.Column("is_demo", sa.Boolean(), server_default=sa.text("true"), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.PrimaryKeyConstraint("id"))
    op.create_index("uq_learning_skill_key", "learning_skills", ["key"], unique=True)
    op.create_index("ix_learning_skill_active", "learning_skills", ["active"])
    op.create_table("learning_resources", sa.Column("id", sa.UUID(), nullable=False), sa.Column("skill_id", sa.UUID(), nullable=False), sa.Column("title", sa.String(240), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("resource_type", sa.String(24), nullable=False), sa.Column("language", sa.String(8), nullable=False), sa.Column("difficulty_level", sa.String(32), server_default="beginner", nullable=False), sa.Column("media_url", sa.Text()), sa.Column("storage_reference", sa.Text()), sa.Column("document_id", sa.UUID()), sa.Column("source_reference", sa.Text()), sa.Column("content_owner", sa.String(160)), sa.Column("version", sa.String(40)), sa.Column("duration_seconds", sa.Integer()), sa.Column("approval_status", sa.String(16), server_default="draft", nullable=False), sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False), sa.Column("is_demo", sa.Boolean(), server_default=sa.text("true"), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.ForeignKeyConstraint(["skill_id"], ["learning_skills.id"], ondelete="RESTRICT"), sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"), sa.CheckConstraint("resource_type IN ('document','guideline','audio','video','text_lesson')", name="ck_learning_resource_type"), sa.CheckConstraint("language IN ('am','om','so','en')", name="ck_learning_resource_language"), sa.CheckConstraint("approval_status IN ('draft','review','approved','archived')", name="ck_learning_resource_status"))
    op.create_index("ix_learning_resource_public", "learning_resources", ["skill_id", "language", "approval_status", "is_active"])
    conn = op.get_bind()
    ids = {}
    for key, name, description, category in SKILLS:
        skill_id = uuid.uuid4(); ids[key] = skill_id
        conn.execute(sa.text("INSERT INTO learning_skills (id,key,name,description,category,is_demo) VALUES (:id,:key,:name,:description,:category,true)"), {"id": skill_id, "key": key, "name": name, "description": description, "category": category})
        conn.execute(sa.text("INSERT INTO learning_resources (id,skill_id,title,description,resource_type,language,approval_status,is_active,is_demo,source_reference) VALUES (:id,:skill_id,:title,:description,'text_lesson','en','approved',true,true,'DEMO CONTENT - replace with trainer-approved Inkomoko material')"), {"id": uuid.uuid4(), "skill_id": skill_id, "title": f"DEMO: {name}", "description": description})
    

def downgrade() -> None:
    op.drop_index("ix_learning_resource_public", table_name="learning_resources")
    op.drop_table("learning_resources")
    op.drop_index("ix_learning_skill_active", table_name="learning_skills")
    op.drop_index("uq_learning_skill_key", table_name="learning_skills")
    op.drop_table("learning_skills")
