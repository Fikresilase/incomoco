"""Admin analytics and knowledge-gap reports (design doc §8)."""

import json
import logging
import re
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import Container
from app.repositories.analytics_repo import AnalyticsRepository

logger = logging.getLogger(__name__)

_GAP_PROMPT = """Below are questions users asked an assistant that it could not answer well (no answer in the knowledge base, low confidence, or a thumbs-down).
Group them into at most 8 topics that describe what information is missing from the knowledge base.
Return ONLY a JSON array, most frequent first, like:
[{{"topic": "short topic label in English", "count": 3, "examples": ["question 1", "question 2"]}}]
Use at most 3 verbatim example questions per topic (keep their original language). Counts must add up to the number of questions.

Questions:
{questions}"""


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(float(value), digits)


def _parse_topics(raw: str) -> list[dict]:
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return []
    try:
        items = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    topics = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and item.get("topic"):
            topics.append(
                {
                    "topic": str(item["topic"])[:120],
                    "count": int(item.get("count") or 0),
                    "examples": [str(e)[:300] for e in (item.get("examples") or [])][:3],
                }
            )
    return topics


class AnalyticsService:
    def __init__(self, container: Container):
        self.c = container

    async def summary(self, db: AsyncSession, days: int) -> dict:
        repo = AnalyticsRepository(db)
        since = datetime.now(UTC) - timedelta(days=days)
        kpis = await repo.kpis(since, self.c.settings.low_confidence_score)
        languages = await repo.user_message_split(since, "lang")
        modalities = await repo.user_message_split(since, "modality")
        devices = await repo.devices(since)
        return {
            "range_days": days,
            "kpis": {
                **{
                    k: int(kpis[k] or 0)
                    for k in ("conversations", "messages", "unique_sessions", "documents_ready")
                },
                **{
                    k: _round(kpis[k])
                    for k in ("feedback_positive_rate", "no_answer_rate", "low_confidence_rate", "error_rate")
                },
                **{
                    k: None if kpis[k] is None else round(kpis[k])
                    for k in ("p50_first_token_ms", "p95_first_token_ms", "p95_voice_turn_ms")
                },
            },
            "timeseries": await repo.timeseries(since),
            "feedback_timeseries": await repo.feedback_timeseries(since),
            "languages": {"am": languages.get("am", 0), "en": languages.get("en", 0)},
            "modalities": {m: modalities.get(m, 0) for m in ("text", "dictation", "voice")},
            "devices": {d: devices.get(d, 0) for d in ("mobile", "desktop", "unknown")},
            "top_documents": await repo.top_documents(since),
            "unused_documents": await repo.unused_documents(),
        }

    async def gaps(self, db: AsyncSession) -> dict:
        repo = AnalyticsRepository(db)
        report = await repo.latest_gap_report()
        recent = await repo.recent_unanswered()
        return {
            "generated_at": report.created_at.isoformat() if report else None,
            "question_count": report.question_count if report else 0,
            "topics": report.topics if report else [],
            "recent_unanswered": [
                {"question": r["question"], "lang": r["lang"], "created_at": r["created_at"].isoformat()}
                for r in recent
            ],
        }

    async def refresh_gaps(self, db: AsyncSession) -> dict:
        s = self.c.settings
        repo = AnalyticsRepository(db)
        since = datetime.now(UTC) - timedelta(days=s.gap_report_days)
        rows = await repo.struggling_questions(since, s.low_confidence_score, limit=300)
        questions = list(dict.fromkeys(r["question"].strip() for r in rows if r["question"].strip()))
        topics: list[dict] = []
        if questions:
            raw = await self.c.llm.complete(
                [
                    {
                        "role": "user",
                        "content": _GAP_PROMPT.format(questions="\n".join(f"- {q}" for q in questions)),
                    }
                ],
                temperature=0.0,
                max_tokens=1500,
            )
            topics = _parse_topics(raw)
        await repo.save_gap_report(s.gap_report_days, len(questions), topics)
        await db.commit()
        return await self.gaps(db)
