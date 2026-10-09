"""Aggregate-only analytics queries (design doc §8). Raw SQL keeps the aggregations readable."""

from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import GapReport


class AnalyticsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _one(self, sql: str, **params) -> dict:
        result = await self.db.execute(text(sql), params)
        return dict(result.mappings().one())

    async def _all(self, sql: str, **params) -> list[dict]:
        result = await self.db.execute(text(sql), params)
        return [dict(r) for r in result.mappings()]

    async def kpis(self, since: datetime, low_score: float) -> dict:
        return await self._one(
            """
            SELECT
              (SELECT count(*) FROM conversations WHERE created_at >= :since) AS conversations,
              (SELECT count(*) FROM messages WHERE created_at >= :since) AS messages,
              (SELECT count(*) FROM chat_sessions WHERE last_seen_at >= :since) AS unique_sessions,
              (SELECT count(*) FROM documents WHERE status = 'ready') AS documents_ready,
              (SELECT avg((rating = 1)::int)::float FROM message_feedback WHERE created_at >= :since)
                AS feedback_positive_rate,
              (SELECT avg(no_answer::int)::float FROM messages
                 WHERE role = 'assistant' AND created_at >= :since) AS no_answer_rate,
              (SELECT avg((top_rerank_score IS NULL OR top_rerank_score < :low)::int)::float
                 FROM retrieval_traces WHERE created_at >= :since) AS low_confidence_rate,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY first_token_ms) FROM messages
                 WHERE role = 'assistant' AND modality <> 'voice' AND created_at >= :since) AS p50_first_token_ms,
              (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY first_token_ms) FROM messages
                 WHERE role = 'assistant' AND modality <> 'voice' AND created_at >= :since) AS p95_first_token_ms,
              (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY first_token_ms) FROM messages
                 WHERE role = 'assistant' AND modality = 'voice' AND created_at >= :since) AS p95_voice_turn_ms,
              (SELECT avg((status = 'error')::int)::float FROM messages
                 WHERE role = 'assistant' AND created_at >= :since) AS error_rate
            """,
            since=since,
            low=low_score,
        )

    async def timeseries(self, since: datetime) -> list[dict]:
        return await self._all(
            """
            WITH days AS (
              SELECT generate_series(date_trunc('day', CAST(:since AS timestamptz)),
                                     date_trunc('day', now()), interval '1 day')::date AS day
            )
            SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                   (SELECT count(*) FROM conversations c WHERE c.created_at::date = d.day) AS conversations,
                   (SELECT count(*) FROM messages m WHERE m.created_at::date = d.day) AS messages
            FROM days d ORDER BY d.day
            """,
            since=since,
        )

    async def feedback_timeseries(self, since: datetime) -> list[dict]:
        return await self._all(
            """
            WITH days AS (
              SELECT generate_series(date_trunc('day', CAST(:since AS timestamptz)),
                                     date_trunc('day', now()), interval '1 day')::date AS day
            )
            SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                   count(f.*) FILTER (WHERE f.rating = 1) AS positive,
                   count(f.*) FILTER (WHERE f.rating = -1) AS negative
            FROM days d LEFT JOIN message_feedback f ON f.created_at::date = d.day
            GROUP BY d.day ORDER BY d.day
            """,
            since=since,
        )

    async def user_message_split(self, since: datetime, column: str) -> dict[str, int]:
        assert column in ("lang", "modality")
        rows = await self._all(
            f"SELECT {column} AS key, count(*) AS n FROM messages "
            "WHERE role = 'user' AND created_at >= :since GROUP BY 1",
            since=since,
        )
        return {r["key"]: r["n"] for r in rows}

    async def devices(self, since: datetime) -> dict[str, int]:
        rows = await self._all(
            "SELECT coalesce(device_type, 'unknown') AS key, count(*) AS n FROM chat_sessions "
            "WHERE last_seen_at >= :since GROUP BY 1",
            since=since,
        )
        return {r["key"]: r["n"] for r in rows}

    async def top_documents(self, since: datetime, limit: int = 10) -> list[dict]:
        return await self._all(
            """
            SELECT s.document_id::text AS document_id, d.title AS title, count(*) AS citations
            FROM message_sources s
            JOIN messages m ON m.id = s.message_id
            JOIN documents d ON d.id = s.document_id
            WHERE m.created_at >= :since
            GROUP BY s.document_id, d.title ORDER BY citations DESC LIMIT :limit
            """,
            since=since,
            limit=limit,
        )

    async def unused_documents(self, limit: int = 20) -> list[dict]:
        return await self._all(
            """
            SELECT d.id::text AS document_id, d.title AS title FROM documents d
            WHERE d.status = 'ready'
              AND NOT EXISTS (SELECT 1 FROM message_sources s WHERE s.document_id = d.id)
            ORDER BY d.uploaded_at DESC LIMIT :limit
            """,
            limit=limit,
        )

    async def struggling_questions(self, since: datetime, low_score: float, limit: int) -> list[dict]:
        """User questions whose answer was a no-answer, low-confidence, or thumbs-down."""
        return await self._all(
            """
            SELECT t.query AS question, m.lang AS lang, m.created_at AS created_at, m.no_answer AS no_answer
            FROM retrieval_traces t
            JOIN messages m ON m.id = t.message_id
            LEFT JOIN message_feedback f ON f.message_id = m.id
            WHERE m.created_at >= :since
              AND (m.no_answer OR t.top_rerank_score IS NULL OR t.top_rerank_score < :low OR f.rating = -1)
            ORDER BY m.created_at DESC LIMIT :limit
            """,
            since=since,
            low=low_score,
            limit=limit,
        )

    async def recent_unanswered(self, limit: int = 20) -> list[dict]:
        return await self._all(
            """
            SELECT t.query AS question, m.lang AS lang, m.created_at AS created_at
            FROM retrieval_traces t JOIN messages m ON m.id = t.message_id
            WHERE m.no_answer ORDER BY m.created_at DESC LIMIT :limit
            """,
            limit=limit,
        )

    async def latest_gap_report(self) -> GapReport | None:
        result = await self.db.execute(select(GapReport).order_by(GapReport.created_at.desc()).limit(1))
        return result.scalar_one_or_none()

    async def save_gap_report(self, period_days: int, question_count: int, topics: list[dict]) -> GapReport:
        report = GapReport(period_days=period_days, question_count=question_count, topics=topics)
        self.db.add(report)
        await self.db.flush()
        return report
