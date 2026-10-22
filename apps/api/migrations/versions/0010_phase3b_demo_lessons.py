"""seed language-matched demo journey lessons"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "6e1a4b8c2d77"
down_revision = "5d9f3c2a7e66"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
def upgrade() -> None:
    op.execute(sa.text("INSERT INTO learning_resources (id, skill_id, title, description, resource_type, language, difficulty_level, duration_seconds, approval_status, is_active, is_demo, source_reference) SELECT gen_random_uuid(), s.id, x.title, x.description, 'text_lesson', 'am', 'beginner', x.duration, 'approved', true, true, 'DEMO CONTENT - replace with trainer-approved Amharic material' FROM learning_skills s CROSS JOIN (VALUES ('cash_flow','የገንዘብ ፍሰት መሠረቶች','የንግድዎ ገንዘብ የት እንደሚሄድ ይረዱ።',4), ('pricing','ለተሻለ ትርፍ ዋጋ አወጣጥ','ዋጋዎን በትክክል ለማወቅ ይማሩ።',5)) AS x(key,title,description,duration) WHERE s.key = x.key AND NOT EXISTS (SELECT 1 FROM learning_resources r WHERE r.skill_id = s.id AND r.language = 'am')"))
    op.execute(sa.text("INSERT INTO learning_progress (id, profile_id, skill_id, resource_id, status, completion_evidence) SELECT gen_random_uuid(), p.id, r.skill_id, r.id, 'started', 'demo-seed' FROM entrepreneur_profiles p JOIN learning_resources r ON r.language = 'am' AND r.skill_id = (SELECT id FROM learning_skills WHERE key = 'cash_flow') WHERE p.demo_key = 'hana' AND NOT EXISTS (SELECT 1 FROM learning_progress lp WHERE lp.profile_id = p.id AND lp.resource_id = r.id)"))
def downgrade() -> None:
    op.execute(sa.text("DELETE FROM learning_progress WHERE completion_evidence = 'demo-seed'"))
    op.execute(sa.text("DELETE FROM learning_resources WHERE source_reference = 'DEMO CONTENT - replace with trainer-approved Amharic material'"))
