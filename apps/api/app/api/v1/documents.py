import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, get_container
from app.core.container import Container
from app.core.db import get_db
from app.schemas.admin import DocumentOut, DocumentPage
from app.services.chat_service import NotFoundError
from app.services.document_service import DocumentService, UploadError

router = APIRouter(prefix="/admin/documents", tags=["admin: documents"], dependencies=[AdminUser])


@router.post("", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    container: Container = Depends(get_container),
) -> DocumentOut:
    data = await file.read(container.settings.max_upload_bytes + 1)
    try:
        document = await DocumentService(container).upload(db, file.filename or "document", data)
    except UploadError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    return DocumentOut.from_orm_document(document)


@router.get("", response_model=DocumentPage)
async def list_documents(
    status_filter: Literal["queued", "processing", "ready", "failed", "deleting", "deleted"] | None = Query(
        default=None, alias="status"
    ),
    q: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    container: Container = Depends(get_container),
) -> DocumentPage:
    items, total = await DocumentService(container).search(
        db, status=status_filter, q=q, page=page, page_size=page_size
    )
    return DocumentPage(items=[DocumentOut.from_orm_document(d) for d in items], total=total)


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID, db: AsyncSession = Depends(get_db), container: Container = Depends(get_container)
) -> DocumentOut:
    try:
        return DocumentOut.from_orm_document(await DocumentService(container).get(db, document_id))
    except NotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.delete("/{document_id}", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def delete_document(
    document_id: uuid.UUID, db: AsyncSession = Depends(get_db), container: Container = Depends(get_container)
) -> DocumentOut:
    try:
        return DocumentOut.from_orm_document(await DocumentService(container).delete(db, document_id))
    except NotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
