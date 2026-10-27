"""Populate the Amharic Financial Basics course with complete chapter content."""
from collections.abc import Sequence
import json
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0017_amharic_content"
down_revision = "0016_fix_learning_course_groups"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHAPTERS = [
    (1, "ገቢና ወጪን መረዳት", "በንግድዎ ውስጥ የሚገባውን ገንዘብ እና የሚወጣውን ገንዘብ ይለዩ።", "ገቢ ንግዱ ከሽያጭ የሚቀበለው ገንዘብ ነው። ወጪ ደግሞ ንግዱን ለማስኬድ የሚከፈለው ገንዘብ ነው።", "አንድ ካፌ 1,200 ብር ሽያጭ አድርጎ 450 ብር ለግብዓት ከፈለ፣ ሁለቱንም በተለያየ መዝገብ ይጻፉ።", "ከሚከተሉት የካፌ ወጪ የትኛው ነው?", "የቡና ፍሬ መግዣ ገንዘብ", "ትናንት የነበረውን ጠቅላላ ሽያጭና እያንዳንዱን ወጪ ይጻፉ።"),
    (2, "ዕለታዊ ወጪን መመዝገብ", "በየቀኑ ወጪዎችን በቀላል ሁኔታ የመመዝገብ ልማድ ይገንቡ።", "ለእያንዳንዱ ወጪ ቀኑን፣ የተገዛውን ነገር፣ መጠኑን እና ምክንያቱን ይጻፉ። ደረሰኝ ካለ ያስቀምጡ።", "አንድ ሱቅ 80 ብር መጓጓዣ፣ 350 ብር ማሸጊያ እና 900 ብር እቃ ገዛ። ዕለታዊ ወጪው 1,330 ብር ነው።", "ከወጪ መጠን ጋር ምን መመዝገብ ይገባል?", "ቀን፣ ዕቃ፣ መጠን እና ምክንያት", "ዛሬ በንግድዎ የተከፈሉ ሶስት ወጪዎችን ይመዝግቡ።"),
    (3, "የአንድ ምርት ዋጋን ማስላት", "አንድ ምርት ለመሥራት የሚወጣውን ወጪ ይወቁ።", "አንድ ምርት የሚጠቀምባቸውን ግብዓቶች ይዘርዝሩ። የጋራ ግዢን በሚያመርተው ምርት ብዛት ይከፋፍሉ።", "300 ብር ግብዓት አምስት ሳንድዊች ካዘጋጀ፣ የአንዱ ቀጥተኛ ወጪ 60 ብር ነው።", "240 ብር አራት ምርቶችን ካመረተ የአንዱ ዋጋ ስንት ነው?", "60 ብር", "አንድ ምርት ይምረጡና የሚጠቀምባቸውን ግብዓቶች ዋጋ ይጻፉ።"),
    (4, "ትርፍን መረዳት", "ከሽያጭ ወጪዎችን ካስወገዱ በኋላ የሚቀረውን ይስሉ።", "ቀላል ጠቅላላ ትርፍ ሽያጭ ሲቀነስ የምርት ቀጥተኛ ወጪ ነው። ሌሎች የንግድ ወጪዎችንም በተለይ ይመዝግቡ።", "ሽያጭ 1,000 ብር እና ቀጥተኛ ወጪ 650 ብር ከሆነ፣ ቀላል ጠቅላላ ትርፍ 350 ብር ነው።", "900 ብር ሽያጭ እና 500 ብር ቀጥተኛ ወጪ ካለ ምን ይቀራል?", "400 ብር", "የአንድ የቅርብ ጊዜ የሽያጭ ቀን ቀላል ትርፍ ይስሉ።"),
    (5, "ተገቢ የሽያጭ ዋጋ ማውጣት", "ዋጋዎን በወጪ፣ በደንበኛ ጥቅም እና በንግድ ፍላጎት ይገምግሙ።", "ዋጋ የምርትን ቀጥተኛ ወጪ መሸፈን እና ለሌሎች ወጪዎች መርዳት አለበት። የደንበኛውን የሚያስፈልገውን ይጠይቁ።", "አንድ ምርት ለመሥራት 60 ብር ከወጣ፣ ዋጋው ከ60 ብር በላይ ሆኖ የንግዱን ሌሎች ወጪዎች ማገናዘብ አለበት።", "ዋጋ ከመቀየርዎ በፊት ምን መመልከት ይገባል?", "የምርት ወጪ፣ የደንበኛ ጥቅም እና የንግድ ወጪዎች", "አንድ የምርት ዋጋ ይገምግሙና ለመጠበቅ ወይም ለመቀየር ምክንያቱን ይጻፉ።"),
    (6, "የሳምንት ገንዘብ ፍሰትን ማስተዳደር", "በሳምንቱ የሚገባውንና የሚወጣውን ገንዘብ በጊዜ ያቅዱ።", "በዚህ ሳምንት የሚገባውን ገንዘብ እና ቀኑ የደረሰ ክፍያ ይዘርዝሩ። ትርፍ ቢኖርም የገንዘብ ጊዜ አስፈላጊ ነው።", "አንድ ነጋዴ 2,000 ብር ሽያጭ እና 1,100 ብር እቃ ክፍያ እንዲሁም 300 ብር መጓጓዣ ይጠብቃል። 600 ብር ከሌሎች ወጪዎች በፊት ይታያል።", "የገንዘብ ፍሰት ዕቅድ በዋናነት ምንን ይመለከታል?", "ገንዘብ የሚገባበትንና የሚወጣበትን ጊዜ", "የዚህን ሳምንት የሚጠበቁ ገቢዎችንና ሶስት ክፍያዎችን ከቀናቸው ጋር ይዘርዝሩ።"),
]


def _content(objective: str, explanation: str, example: str, question: str, answer: str, apply: str) -> str:
    return json.dumps({"objective": objective, "sections": [{"title": "ዋናው ነገር", "body": explanation}, {"title": "በንግድዎ ውስጥ ይጠቀሙበት", "body": "ቁጥሮችዎን በየቀኑ ይመዝግቡ። ግምት ካደረጉ ግምት መሆኑን ይጻፉ።"}], "example": example, "practice": {"question": question, "options": [answer, "ይህ ምላሽ አይደለም", "ትክክለኛውን መዝገብ ሳይመለከቱ መገመት"], "answer": 0, "feedback": "ትክክል ነው። በራስዎ የንግድ መዝገብ ይደግፉት።"}, "apply": apply}, ensure_ascii=False)


def upgrade() -> None:
    conn = op.get_bind()
    skill_ids = {row.key: row.id for row in conn.execute(sa.text("SELECT key, id FROM learning_skills WHERE key IN ('cash_flow', 'pricing')"))}
    for number, title, description, explanation, example, question, answer, apply in CHAPTERS:
        skill_key = "cash_flow" if number in (1, 2, 6) else "pricing"
        legacy_title = {1: "የገንዘብ ፍሰት መሠረቶች", 5: "ለተሻለ ትርፍ ዋጋ አወጣጥ"}.get(number)
        existing = conn.execute(sa.text("SELECT id FROM learning_resources WHERE language = 'am' AND (title = :title OR title = :legacy_title)"), {"title": title, "legacy_title": legacy_title or "__none__"}).scalar()
        values = {"title": title, "description": description, "skill_id": skill_ids[skill_key], "course_key": "financial_basics", "chapter": number, "content": _content(description, explanation, example, question, answer, apply)}
        if existing:
            conn.execute(sa.text("UPDATE learning_resources SET skill_id=:skill_id, description=:description, course_key=:course_key, chapter_number=:chapter, lesson_content=CAST(:content AS jsonb), approval_status='approved', is_active=true WHERE id=:id"), {**values, "id": existing})
        else:
            conn.execute(sa.text("""INSERT INTO learning_resources (id, skill_id, title, description, resource_type, language, difficulty_level, duration_seconds, course_key, chapter_number, lesson_content, approval_status, is_active, is_demo, source_reference, content_owner, version)
            VALUES (:id, :skill_id, :title, :description, 'text_lesson', 'am', 'beginner', 480, :course_key, :chapter, CAST(:content AS jsonb), 'approved', true, true, 'DEMO CONTENT - replace with trainer-approved Amharic material', 'Inkomoko MVP sample content', '1.0')"""), {**values, "id": uuid.uuid4()})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM learning_resources WHERE language='am' AND course_key='financial_basics' AND content_owner='Inkomoko MVP sample content'"))
