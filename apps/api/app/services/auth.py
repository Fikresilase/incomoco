import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.repositories.orm import (
    AccountRole,
    AuthSession,
    Organization,
    Permission,
    Role,
    RolePermission,
    UserAccount,
    utcnow,
)

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def _hash_refresh(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def role_names(db: AsyncSession, account_id: uuid.UUID) -> list[str]:
    rows = await db.execute(select(Role.name).join(AccountRole, AccountRole.role_id == Role.id).where(AccountRole.account_id == account_id))
    return list(rows.scalars())


async def permission_keys(db: AsyncSession, account_id: uuid.UUID) -> set[str]:
    rows = await db.execute(select(Permission.key).join(RolePermission, RolePermission.permission_id == Permission.id).join(AccountRole, AccountRole.role_id == RolePermission.role_id).where(AccountRole.account_id == account_id))
    return set(rows.scalars())


def issue_access(account: UserAccount, session_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    return jwt.encode({"sub": str(account.id), "sid": str(session_id), "iat": now, "exp": now + ACCESS_TTL}, get_settings().jwt_secret, algorithm="HS256")


async def create_session(db: AsyncSession, account: UserAccount) -> tuple[str, str, AuthSession]:
    refresh = secrets.token_urlsafe(48)
    session = AuthSession(account_id=account.id, refresh_hash=_hash_refresh(refresh), expires_at=utcnow() + REFRESH_TTL)
    db.add(session)
    await db.flush()
    return issue_access(account, session.id), refresh, session


async def rotate_session(db: AsyncSession, refresh: str) -> tuple[UserAccount, str, str] | None:
    session = await db.scalar(select(AuthSession).where(AuthSession.refresh_hash == _hash_refresh(refresh)).with_for_update())
    if not session or session.revoked_at or session.expires_at <= utcnow():
        return None
    account = await db.get(UserAccount, session.account_id)
    if not account or not account.is_active:
        session.revoked_at = utcnow()
        return None
    session.revoked_at = utcnow()
    session.rotated_at = utcnow()
    access, new_refresh, _ = await create_session(db, account)
    return account, access, new_refresh


async def ensure_default_roles(db: AsyncSession) -> None:
    role_permissions = {
        "super_admin": {"users.manage", "roles.manage", "reports.view"},
        "admin": {"users.manage", "reports.view"},
        "adviser": {"profile.read_assigned", "messaging.use", "recommendations.create"},
        "entrepreneur": {"profile.read_own", "profile.write_own", "learning.use", "business.use"},
    }
    for role_name, keys in role_permissions.items():
        role = await db.scalar(select(Role).where(Role.name == role_name))
        if not role:
            continue
        for key in keys:
            permission = await db.scalar(select(Permission).where(Permission.key == key))
            if permission and not await db.scalar(select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == permission.id)):
                db.add(RolePermission(role_id=role.id, permission_id=permission.id))


async def default_organization(db: AsyncSession) -> Organization:
    organization = await db.scalar(select(Organization).where(Organization.slug == "inkomoko"))
    if not organization:
        organization = Organization(name="Inkomoko", slug="inkomoko")
        db.add(organization)
        await db.flush()
    return organization
