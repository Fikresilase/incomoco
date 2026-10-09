"""Processes ingestion_jobs: ingest (convert → chunk → index) and delete (design doc §6.2, §7.3)."""

import asyncio
import logging
import uuid

from sqlalchemy import update

from app.core.container import Container
from app.core.db import SessionFactory
from app.repositories.document_repo import MAX_ATTEMPTS, DocumentRepository
from app.repositories.orm import Document, IngestionJob, utcnow

logger = logging.getLogger(__name__)


class IngestionWorker:
    def __init__(self, container: Container):
        self.c = container

    async def run_once(self) -> bool:
        """Claim and process one job. Returns False when the queue is empty."""
        async with SessionFactory() as db:
            job = await DocumentRepository(db).claim_next_job()
            if job is None:
                return False
            job_id, job_type, document_id, attempts = job.id, job.type, job.document_id, job.attempts
            await db.commit()  # release the row lock; the job is now 'running'

        log = {"job_id": str(job_id), "document_id": str(document_id)}
        logger.info("Processing %s job (attempt %s)", job_type, attempts, extra=log)
        error: str | None = None
        try:
            if job_type == "ingest":
                await self._ingest(document_id)
            else:
                await self._delete(document_id)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            logger.exception("Job failed", extra=log)

        async with SessionFactory() as db:
            repo = DocumentRepository(db)
            job = await db.get(IngestionJob, job_id)
            await repo.finish_job(job, error=error)
            if error and job_type == "ingest":
                final = job.status == "failed"
                await db.execute(
                    update(Document)
                    .where(Document.id == document_id, Document.status == "processing")
                    .values(status="failed" if final else "queued", error=_friendly(error) if final else None)
                )
            await db.commit()
        return True

    async def _ingest(self, document_id: uuid.UUID) -> None:
        async with SessionFactory() as db:
            document = await db.get(Document, document_id)
            if document is None or document.status in ("deleting", "deleted"):
                return
            document.status = "processing"
            document.error = None
            await db.commit()
            title, filename, key = document.title, document.filename, document.storage_key

        data = await asyncio.to_thread(self.c.blob_store.get, key)
        result = await self.c.indexer.index(
            document_id=str(document_id), title=title, filename=filename, data=data
        )

        async with SessionFactory() as db:
            # Only flip to ready if nobody asked to delete it meanwhile.
            await db.execute(
                update(Document)
                .where(Document.id == document_id, Document.status == "processing")
                .values(
                    status="ready",
                    chunk_count=result.chunk_count,
                    page_count=result.page_count,
                    lang=result.lang,
                    processed_at=utcnow(),
                    error=None,
                )
            )
            await db.commit()

    async def _delete(self, document_id: uuid.UUID) -> None:
        async with SessionFactory() as db:
            document = await db.get(Document, document_id)
            if document is None:
                return
            key = document.storage_key
        await asyncio.to_thread(self.c.vector_store.delete_document, str(document_id))
        await asyncio.to_thread(self.c.blob_store.delete, key)
        async with SessionFactory() as db:
            await db.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(status="deleted", deleted_at=utcnow())
            )
            await db.commit()


def _friendly(error: str) -> str:
    if "No text could be extracted" in error:
        return "No text could be extracted from this document."
    if "OpenRouter 401" in error or "OpenRouter 403" in error:
        return "The AI service rejected the request. Check OPENROUTER_API_KEY."
    if "OpenRouter 402" in error:
        return "The AI service account is out of credits."
    return f"Processing failed after {MAX_ATTEMPTS} attempts: {error[:300]}"
