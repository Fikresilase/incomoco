"""seed deterministic Phase 3B demo evidence"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "4c8e2b1d6f55"
down_revision = "3b7f1a2c9d44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    op.execute(sa.text("INSERT INTO skill_evidence (id, profile_id, skill_id, evidence_type, result, source_reference) SELECT gen_random_uuid(), p.id, s.id, 'practice_incorrect', 'negative', 'demo-seed' FROM entrepreneur_profiles p JOIN learning_skills s ON s.key = 'cash_flow' CROSS JOIN generate_series(1, 2) WHERE p.demo_key = 'hana' AND NOT EXISTS (SELECT 1 FROM skill_evidence e WHERE e.profile_id = p.id AND e.skill_id = s.id)"))
    op.execute(sa.text("INSERT INTO skill_evidence (id, profile_id, skill_id, evidence_type, result, source_reference) SELECT gen_random_uuid(), p.id, s.id, x.kind, 'positive', 'demo-seed' FROM entrepreneur_profiles p JOIN learning_skills s ON s.key = 'record_keeping' CROSS JOIN (VALUES ('lesson_completed'), ('practice_correct')) AS x(kind) WHERE p.demo_key IN ('hana', 'mulu') AND NOT EXISTS (SELECT 1 FROM skill_evidence e WHERE e.profile_id = p.id AND e.skill_id = s.id AND e.evidence_type = x.kind)"))

def downgrade() -> None:
    op.execute(sa.text("DELETE FROM skill_evidence WHERE source_reference = 'demo-seed'"))
