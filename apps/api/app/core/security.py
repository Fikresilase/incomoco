import hmac
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import bcrypt
import jwt

from app.core.config import get_settings

ADMIN_COOKIE = "inkomoko_admin"
SESSION_COOKIE = "inkomoko_sid"


@lru_cache
def _admin_password_hash() -> bytes:
    # Hashed once at startup so the plaintext is never compared directly.
    return bcrypt.hashpw(get_settings().admin_password.encode(), bcrypt.gensalt())


def verify_admin(username: str, password: str) -> bool:
    settings = get_settings()
    user_ok = hmac.compare_digest(username.encode(), settings.admin_username.encode())
    pass_ok = bcrypt.checkpw(password.encode(), _admin_password_hash())
    return user_ok and pass_ok


def create_admin_token(username: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    claims = {
        "sub": username,
        "role": "admin",
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_ttl_hours),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def decode_admin_token(token: str) -> str | None:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return claims.get("sub") if claims.get("role") == "admin" else None
