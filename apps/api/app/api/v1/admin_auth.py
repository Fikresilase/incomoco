import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, limiter
from app.core.db import get_db
from app.repositories.audit_repo import record_audit
from app.repositories.orm import UserAccount
from app.schemas.admin import AdminOut, LoginIn
from app.services.auth import create_session, role_names, verify_password

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminOut)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    account = await db.scalar(select(UserAccount).where(UserAccount.email == body.username.lower()))
    if not account or not account.is_active or not verify_password(body.password, account.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    if not (set(await role_names(db, account.id)) & {"super_admin", "admin"}):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    access, refresh, _ = await create_session(db, account)
    response.set_cookie("inkomoko_access", access, max_age=900, httponly=True, samesite="lax")
    response.set_cookie("inkomoko_refresh", refresh, max_age=604800, httponly=True, samesite="lax")
    await record_audit(db, "admin.login")
    await db.commit()
    return AdminOut(username=account.email)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie("inkomoko_access")
    response.delete_cookie("inkomoko_refresh")
    return response


@router.get("/me", response_model=AdminOut)
async def me(account_id: str = AdminUser, db: AsyncSession = Depends(get_db)) -> AdminOut:
    account = await db.get(UserAccount, uuid.UUID(account_id))
    return AdminOut(username=account.email)
