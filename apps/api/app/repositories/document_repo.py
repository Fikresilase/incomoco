"""Data access for documents and the Postgres-backed ingestion job queue (design doc §6.2)."""

import uuid

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import Document, IngestionJob, utcnow

MAX_ATTEMPTS = 3


class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ---- documents --------------------------------------------------------------

    async def find_active_by_checksum(self, checksum: str) -> Document | None:
        result = await self.db.execute(
            select(Document).where(Document.checksum == checksum, Document.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def create(self, **fields) -> Document:
        document = Document(**fields)
        self.db.add(document)
        await self.db.flush()
        return document

    async def get(self, document_id: uuid.UUID) -> Document | None:
        return await self.db.get(Document, document_id)

    async def search(
        self, *, status: str | None, q: str | None, page: int, page_size: int
    ) -> tuple[list[Document], int]:
        query = select(Document)
        query = (
            query.where(Document.status == status) if status else query.where(Document.status != "deleted")
        )
        if q:
            pattern = f"%{q}%"
            query = query.where(or_(Document.title.ilike(pattern), Document.filename.ilike(pattern)))
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = await self.db.execute(
            query.order_by(Document.uploaded_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        return list(rows.scalars()), total

    async def ready_ids(self) -> list[str]:
        result = await self.db.execute(select(Document.id).where(Document.status == "ready"))
        return [str(r) for r in result.scalars()]

    async def set_status(self, document_id: uuid.UUID, status: str, **fields) -> None:
        await self.db.execute(
            update(Document).where(Document.id == document_id).values(status=status, **fields)
        )

    # ---- jobs -------------------------------------------------------------------

    async def enqueue(self, document_id: uuid.UUID, job_type: str) -> IngestionJob:
        job = IngestionJob(document_id=document_id, type=job_type)
        self.db.add(job)
        await self.db.flush()
        return job

    async def claim_next_job(self) -> IngestionJob | None:
        """Atomically claim the oldest queued job; deletes go first so they are never starved."""
        result = await self.db.execute(
            select(IngestionJob)
            .where(IngestionJob.status == "queued")
            .order_by(text("CASE WHEN type = 'delete' THEN 0 ELSE 1 END"), IngestionJob.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        job = result.scalar_one_or_none()
        if job is None:
            return None
        job.status = "running"
        job.attempts += 1
        job.started_at = utcnow()
        return job

    async def finish_job(self, job: IngestionJob, *, error: str | None = None) -> None:
        if error is None:
            job.status = "succeeded"
        else:
            job.error = error[:2000]
            job.status = "queued" if job.attempts < MAX_ATTEMPTS else "failed"
        job.finished_at = utcnow()

    async def requeue_stale_jobs(self) -> int:
        """Jobs left 'running' by a crashed worker go back to the queue on startup."""
        result = await self.db.execute(
            update(IngestionJob).where(IngestionJob.status == "running").values(status="queued")
        )
        return result.rowcount or 0
