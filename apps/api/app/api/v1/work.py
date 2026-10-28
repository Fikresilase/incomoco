"""Session-owned work records; sample cards never enter this ledger."""

import uuid
from collections import Counter
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, session_id_from
from app.repositories.orm import (
    BusinessAction,
    BusinessCustomer,
    BusinessTransaction,
    LearningProgress,
    WorkActivity,
    WorkTodo,
    utcnow,
)
from app.schemas.work import CustomerIn, TodoIn, TransactionIn
from app.services.entrepreneur import EntrepreneurContextService

router = APIRouter(prefix="/me/work", tags=["work"])


async def owned(db, request, model, record_id):
    profile = await EntrepreneurContextService().get_or_create_guest(db, session_id_from(request))
    row = await db.scalar(
        select(model).where(model.id == record_id, model.profile_id == profile.id).with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


async def activity(db, profile_id, kind, source_id):
    await db.execute(
        insert(WorkActivity)
        .values(id=uuid.uuid4(), profile_id=profile_id, kind=kind, source_id=f"{kind}:{source_id}")
        .on_conflict_do_nothing(index_elements=[WorkActivity.source_id])
    )


def record(row):
    return {
        column.name: (
            str(getattr(row, column.name))
            if isinstance(getattr(row, column.name), Decimal)
            else getattr(row, column.name)
        )
        for column in row.__table__.columns
        if column.name != "profile_id"
    }


@router.get("")
async def overview(
    request: Request,
    timezone: str = "Africa/Nairobi",
    month: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        zone = ZoneInfo(timezone)
        today = datetime.now(zone).date()
        first = datetime.strptime(month, "%Y-%m").date().replace(day=1) if month else today.replace(day=1)
    except (ValueError, ZoneInfoNotFoundError):
        raise HTTPException(422, "Use a valid timezone and YYYY-MM month") from None
    end = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    profile = await EntrepreneurContextService().get_or_create_guest(db, session_id_from(request))
    todos = (
        await db.scalars(
            select(WorkTodo).where(WorkTodo.profile_id == profile.id).order_by(WorkTodo.created_at.desc())
        )
    ).all()
    customers = (
        await db.scalars(
            select(BusinessCustomer)
            .where(BusinessCustomer.profile_id == profile.id)
            .order_by(BusinessCustomer.created_at.desc())
        )
    ).all()
    ledger = select(BusinessTransaction).where(
        BusinessTransaction.profile_id == profile.id,
        BusinessTransaction.occurred_on >= first,
        BusinessTransaction.occurred_on < end,
    )
    transactions = (
        await db.scalars(
            ledger.order_by(BusinessTransaction.occurred_on.desc(), BusinessTransaction.created_at.desc())
        )
    ).all()
    totals = {}
    for row in transactions:
        amounts = totals.setdefault(row.currency, {"income": 0, "expense": 0})
        amounts[row.kind] += row.amount
    days = Counter()
    since = datetime.combine(today - timedelta(days=90), datetime.min.time(), tzinfo=zone)
    for model, field in (
        (WorkActivity, WorkActivity.created_at),
        (BusinessAction, BusinessAction.completed_at),
        (LearningProgress, LearningProgress.completed_at),
    ):
        stamps = (await db.scalars(select(field).where(model.profile_id == profile.id, field >= since))).all()
        for stamp in stamps:
            days[stamp.astimezone(zone).date().isoformat()] += 1
    await db.commit()
    return {
        "month": first.strftime("%Y-%m"),
        "today": today,
        "todos": [record(r) for r in todos],
        "customers": [record(r) for r in customers],
        "transactions": [record(r) for r in transactions],
        "totals": {
            currency: {kind: str(amount) for kind, amount in amounts.items()}
            for currency, amounts in totals.items()
        },
        "activity": dict(days),
        "customer_count": len(customers),
    }


@router.post("/todos", status_code=201)
async def create_todo(body: TodoIn, request: Request, db: AsyncSession = Depends(get_db)):
    profile = await EntrepreneurContextService().get_or_create_guest(db, session_id_from(request))
    row = WorkTodo(
        profile_id=profile.id,
        title=body.title,
        due_date=body.due_date,
        completed_at=utcnow() if body.completed else None,
    )
    db.add(row)
    await db.flush()
    if body.completed:
        await activity(db, profile.id, "todo", row.id)
    await db.commit()
    return record(row)


@router.put("/todos/{record_id}")
async def update_todo(
    record_id: uuid.UUID, body: TodoIn, request: Request, db: AsyncSession = Depends(get_db)
):
    row = await owned(db, request, WorkTodo, record_id)
    row.title, row.due_date = body.title, body.due_date
    row.completed_at = (row.completed_at or utcnow()) if body.completed else None
    if body.completed:
        await activity(db, row.profile_id, "todo", row.id)
    await db.commit()
    return record(row)


@router.post("/transactions", status_code=201)
async def create_transaction(body: TransactionIn, request: Request, db: AsyncSession = Depends(get_db)):
    profile = await EntrepreneurContextService().get_or_create_guest(db, session_id_from(request))
    row = BusinessTransaction(profile_id=profile.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await activity(db, profile.id, "transaction", row.id)
    await db.commit()
    return record(row)


@router.put("/transactions/{record_id}")
async def update_transaction(
    record_id: uuid.UUID, body: TransactionIn, request: Request, db: AsyncSession = Depends(get_db)
):
    row = await owned(db, request, BusinessTransaction, record_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    return record(row)


@router.post("/customers", status_code=201)
async def create_customer(body: CustomerIn, request: Request, db: AsyncSession = Depends(get_db)):
    profile = await EntrepreneurContextService().get_or_create_guest(db, session_id_from(request))
    row = BusinessCustomer(profile_id=profile.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await activity(db, profile.id, "customer", row.id)
    await db.commit()
    return record(row)


@router.put("/customers/{record_id}")
async def update_customer(
    record_id: uuid.UUID, body: CustomerIn, request: Request, db: AsyncSession = Depends(get_db)
):
    row = await owned(db, request, BusinessCustomer, record_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    return record(row)


@router.delete("/{collection}/{record_id}", status_code=204)
async def delete_record(
    collection: str, record_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
):
    model = {"todos": WorkTodo, "transactions": BusinessTransaction, "customers": BusinessCustomer}.get(
        collection
    )
    if model is None:
        raise HTTPException(404, "Collection not found")
    row = await owned(db, request, model, record_id)
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)
