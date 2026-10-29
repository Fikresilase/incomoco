import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_csrf, strict_account
from app.repositories.orm import AccountRole, Notification, Role, UserAccount
from app.services.auth import permission_keys

router = APIRouter(prefix="/admin/notifications", tags=["admin: notifications"])


class BroadcastIn(BaseModel):
    audience: Literal["all", "entrepreneurs", "advisers"] = "all"
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=2000)


@router.post("/broadcast", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def broadcast(body: BroadcastIn, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    if "users.manage" not in await permission_keys(db, account.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Notification administration required")
    query = (
        select(UserAccount)
        .join(AccountRole, AccountRole.account_id == UserAccount.id)
        .join(Role, Role.id == AccountRole.role_id)
        .where(UserAccount.organization_id == account.organization_id, UserAccount.is_active.is_(True), UserAccount.id != account.id)
    )
    query = query.where(Role.name == body.audience[:-1] if body.audience in {"advisers", "entrepreneurs"} else Role.name.in_(["adviser", "entrepreneur"]))
    recipients = (await db.scalars(query.distinct())).all()
    broadcast_id = uuid.uuid4()
    db.add_all([
        Notification(recipient_account_id=recipient.id, event_type="admin_broadcast", related_entity_id=broadcast_id, title=body.title, body=body.body)
        for recipient in recipients
    ])
    await db.commit()
    return {"id": broadcast_id, "audience": body.audience, "recipient_count": len(recipients)}
