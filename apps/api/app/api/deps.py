"""Shared FastAPI dependencies: container, services, session cookie, admin guard, rate limiter."""

import uuid

import jwt
from fastapi import Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select

from app.core.config import get_settings
from app.core.container import Container
from app.core.db import get_db
from app.core.security import SESSION_COOKIE
from app.repositories.orm import UserAccount
from app.services.auth import permission_keys

limiter = Limiter(key_func=get_remote_address)


def get_container(request: Request) -> Container:
    return request.app.state.container


def session_id_from(request: Request) -> uuid.UUID:
    """The session middleware guarantees a valid anonymous session ID on every HTTP request."""
    return request.state.session_id


def parse_session_cookie(value: str | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if value else None
    except ValueError:
        return None


def device_type_from(request: Request) -> str:
    ua = request.headers.get("user-agent", "").lower()
    return "mobile" if any(k in ua for k in ("mobile", "android", "iphone", "ipad")) else "desktop"


def require_admin(request: Request) -> str:
    token = request.cookies.get("inkomoko_access", "")
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        account_id = uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        account_id = None
    if account_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    request.state.account_id = account_id
    return str(account_id)


AdminUser = Depends(require_admin)


async def current_account(request: Request, db=Depends(get_db)) -> UserAccount:
    account_id = getattr(request.state, "account_id", None)
    if account_id is None:
        require_admin(request)
        account_id = request.state.account_id
    account = await db.scalar(select(UserAccount).where(UserAccount.id == account_id, UserAccount.is_active.is_(True)))
    if account is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is disabled or missing")
    return account


def require_permission(permission: str):
    async def dependency(account: UserAccount = Depends(current_account), db=Depends(get_db)) -> UserAccount:
        if permission not in await permission_keys(db, account.id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission denied")
        return account
    return dependency

__all__ = [
    "SESSION_COOKIE",
    "AdminUser",
    "device_type_from",
    "get_db",
    "get_container",
    "limiter",
    "parse_session_cookie",
    "require_admin",
    "current_account",
    "require_permission",
    "session_id_from",
]
