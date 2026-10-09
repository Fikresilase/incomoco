from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, limiter
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import ADMIN_COOKIE, create_admin_token, verify_admin
from app.repositories.audit_repo import record_audit
from app.schemas.admin import AdminOut, LoginIn

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminOut)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    if not verify_admin(body.username, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    settings = get_settings()
    response.set_cookie(
        ADMIN_COOKIE,
        create_admin_token(body.username),
        max_age=settings.jwt_ttl_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
    await record_audit(db, "admin.login")
    await db.commit()
    return AdminOut(username=body.username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(ADMIN_COOKIE)
    return response


@router.get("/me", response_model=AdminOut)
async def me(username: str = AdminUser) -> AdminOut:
    return AdminOut(username=username)
