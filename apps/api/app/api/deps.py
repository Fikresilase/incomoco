"""Shared FastAPI dependencies: container, services, session cookie, admin guard, rate limiter."""

import uuid

from fastapi import Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.container import Container
from app.core.security import ADMIN_COOKIE, SESSION_COOKIE, decode_admin_token

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
    username = decode_admin_token(request.cookies.get(ADMIN_COOKIE, ""))
    if username is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return username


AdminUser = Depends(require_admin)

__all__ = [
    "SESSION_COOKIE",
    "AdminUser",
    "device_type_from",
    "get_container",
    "limiter",
    "parse_session_cookie",
    "require_admin",
    "session_id_from",
]
