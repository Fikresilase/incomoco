import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.orm import AuditLog


async def record_audit(
    db: AsyncSession,
    action: str,
    *,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor: str = "admin",
    **metadata,
) -> None:
    db.add(
        AuditLog(actor=actor, action=action, entity_type=entity_type, entity_id=entity_id, metadata_=metadata)
    )
