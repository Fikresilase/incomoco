from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, get_container
from app.core.container import Container
from app.core.db import get_db
from app.schemas.admin import AnalyticsSummary, GapsOut
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/admin/analytics", tags=["admin: analytics"], dependencies=[AdminUser])


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    container: Container = Depends(get_container),
):
    return await AnalyticsService(container).summary(db, days)


@router.get("/gaps", response_model=GapsOut)
async def analytics_gaps(db: AsyncSession = Depends(get_db), container: Container = Depends(get_container)):
    return await AnalyticsService(container).gaps(db)


@router.post("/gaps/refresh", response_model=GapsOut)
async def refresh_gaps(db: AsyncSession = Depends(get_db), container: Container = Depends(get_container)):
    return await AnalyticsService(container).refresh_gaps(db)
