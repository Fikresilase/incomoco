"""Knowledge-base document management (design doc §6.2, §7.3)."""

import asyncio
import hashlib
import re
import uuid
from pathlib import PurePath

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import Container
from app.rag.ingestion.converters import SUPPORTED_EXTENSIONS, extension_of
from app.repositories.audit_repo import record_audit
from app.repositories.document_repo import DocumentRepository
from app.repositories.orm import Document
from app.services.chat_service import NotFoundError


class UploadError(ValueError):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


def _safe_filename(filename: str) -> str:
    name = PurePath(filename).name
    return re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE)[:200] or "document"


def title_from_filename(filename: str) -> str:
    stem = PurePath(filename).stem
    return re.sub(r"[_\-]+", " ", stem).strip() or "Untitled document"


class DocumentService:
    def __init__(self, container: Container):
        self.c = container

    async def upload(self, db: AsyncSession, filename: str, data: bytes) -> Document:
        extension = extension_of(filename)
        if extension not in SUPPORTED_EXTENSIONS:
            raise UploadError("Unsupported file type. Upload PDF, DOCX, TXT, or MD.", 415)
        if len(data) > self.c.settings.max_upload_bytes:
            raise UploadError(f"File is larger than {self.c.settings.max_upload_mb} MB.", 413)
        if not data:
            raise UploadError("The file is empty.", 400)

        repo = DocumentRepository(db)
        checksum = hashlib.sha256(data).hexdigest()
        if await repo.find_active_by_checksum(checksum):
            raise UploadError("This document has already been uploaded.", 409)

        document_id = uuid.uuid4()
        storage_key = f"documents/{document_id}/{_safe_filename(filename)}"
        mime = SUPPORTED_EXTENSIONS[extension]
        await asyncio.to_thread(self.c.blob_store.put, storage_key, data, mime)

        document = await repo.create(
            id=document_id,
            title=title_from_filename(filename),
            filename=PurePath(filename).name,
            mime=mime,
            size_bytes=len(data),
            checksum=checksum,
            storage_key=storage_key,
            status="queued",
        )
        await repo.enqueue(document.id, "ingest")
        await record_audit(
            db, "document.upload", entity_type="document", entity_id=document.id, filename=filename
        )
        await db.commit()
        return document

    async def get(self, db: AsyncSession, document_id: uuid.UUID) -> Document:
        document = await DocumentRepository(db).get(document_id)
        if document is None:
            raise NotFoundError("Document not found")
        return document

    async def search(self, db: AsyncSession, *, status: str | None, q: str | None, page: int, page_size: int):
        return await DocumentRepository(db).search(status=status, q=q, page=page, page_size=page_size)

    async def delete(self, db: AsyncSession, document_id: uuid.UUID) -> Document:
        repo = DocumentRepository(db)
        document = await self.get(db, document_id)
        if document.status in ("deleting", "deleted"):
            return document
        # Leaving 'ready' removes it from retrieval immediately; the worker cleans up storage.
        document.status = "deleting"
        await repo.enqueue(document.id, "delete")
        await record_audit(
            db, "document.delete", entity_type="document", entity_id=document.id, title=document.title
        )
        await db.commit()
        return document
