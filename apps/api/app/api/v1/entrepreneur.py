import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, limiter, session_id_from
from app.repositories.orm import EntrepreneurProfile
from app.schemas.entrepreneur import (
    EntrepreneurContextOut,
    EntrepreneurProfileOut,
    EntrepreneurProfilePatch,
    GuestSessionOut,
)
from app.services.entrepreneur import EntrepreneurContextService

router = APIRouter(tags=["entrepreneur"])


async def _profile(db: AsyncSession, session_id: uuid.UUID) -> EntrepreneurProfile:
    return await EntrepreneurContextService().get_or_create_guest(db, session_id)


@router.post("/guest/session", response_model=GuestSessionOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_guest_session(request: Request, db: AsyncSession = Depends(get_db)) -> GuestSessionOut:
    session_id = session_id_from(request)
    profile = await _profile(db, session_id)
    await db.commit()
    return GuestSessionOut(session_id=session_id, profile=profile)


@router.get("/me/entrepreneur-profile", response_model=EntrepreneurProfileOut)
async def get_profile(request: Request, db: AsyncSession = Depends(get_db)) -> EntrepreneurProfileOut:
    profile = await _profile(db, session_id_from(request))
    await db.commit()
    return profile


@router.patch("/me/entrepreneur-profile", response_model=EntrepreneurProfileOut)
async def update_profile(
    body: EntrepreneurProfilePatch, request: Request, db: AsyncSession = Depends(get_db)
) -> EntrepreneurProfileOut:
    profile = await EntrepreneurContextService().update_guest(
        db, session_id_from(request), body.model_dump(exclude_unset=True)
    )
    await db.commit()
    return profile


@router.get("/me/entrepreneur-context", response_model=EntrepreneurContextOut)
async def get_context(request: Request, db: AsyncSession = Depends(get_db)) -> EntrepreneurContextOut:
    context = await EntrepreneurContextService().context_for_guest(db, session_id_from(request))
    return EntrepreneurContextOut(
        preferred_language=context.preferred_language,
        confirmed_business_context=context.confirmed,
        user_stated_context=context.user_stated,
    )
