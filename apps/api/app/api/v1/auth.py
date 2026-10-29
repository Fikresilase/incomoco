import secrets
import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.repositories.orm import AccountRole, AuthSession, EntrepreneurProfile, Role, UserAccount
from app.schemas.auth import AccountCreateIn, AccountOut, AuthOut, LoginIn, RegisterIn
from app.services.auth import (
    create_session,
    default_organization,
    ensure_default_roles,
    hash_password,
    role_names,
    rotate_session,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
ACCESS_COOKIE = "inkomoko_access"
REFRESH_COOKIE = "inkomoko_refresh"
CSRF_COOKIE = "inkomoko_csrf"


def _cookies(response: Response, access: str, refresh: str) -> None:
    secure = get_settings().cookie_secure
    response.set_cookie(ACCESS_COOKIE, access, max_age=900, httponly=True, secure=secure, samesite="lax")
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=604800, httponly=True, secure=secure, samesite="lax")
    response.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(24), max_age=604800, httponly=False, secure=secure, samesite="lax")


async def _account_out(db: AsyncSession, account: UserAccount) -> AccountOut:
    return AccountOut(id=account.id, email=account.email, display_name=account.display_name, roles=await role_names(db, account.id), is_active=account.is_active)


async def _login(account: UserAccount, db: AsyncSession, response: Response) -> AuthOut:
    access, refresh, _ = await create_session(db, account)
    _cookies(response, access, refresh)
    await db.commit()
    return AuthOut(account=await _account_out(db, account))


async def _claim_selected_demo(request: Request, account: UserAccount, db: AsyncSession) -> None:
    """Claim only the explicitly selected, unowned demo business for an entrepreneur account."""
    if not await db.scalar(select(AccountRole).join(Role, Role.id == AccountRole.role_id).where(AccountRole.account_id == account.id, Role.name == "entrepreneur")):
        return
    demo_key = request.cookies.get("inkomoko_demo_key")
    if not demo_key:
        return
    profile = await db.scalar(select(EntrepreneurProfile).where(EntrepreneurProfile.demo_key == demo_key, EntrepreneurProfile.is_demo.is_(True), EntrepreneurProfile.user_id.is_(None)))
    if profile:
        profile.user_id = account.id
        profile.organization_id = account.organization_id
        profile.identity_type = "registered"


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> AuthOut:
    if await db.scalar(select(UserAccount).where(UserAccount.email == body.email.lower())):
        raise HTTPException(409, "Account already exists")
    organization = await default_organization(db)
    await ensure_default_roles(db)
    account = UserAccount(email=body.email.lower(), password_hash=hash_password(body.password), display_name=body.display_name, organization_id=organization.id)
    db.add(account)
    await db.flush()
    role = await db.scalar(select(Role).where(Role.name == "entrepreneur"))
    db.add(AccountRole(account_id=account.id, role_id=role.id))
    await db.flush()
    await _claim_selected_demo(request, account, db)
    return await _login(account, db, response)


@router.post("/login", response_model=AuthOut)
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> AuthOut:
    account = await db.scalar(select(UserAccount).where(UserAccount.email == body.email.lower()))
    if not account or not account.is_active or not verify_password(body.password, account.password_hash):
        raise HTTPException(401, "Invalid credentials")
    await _claim_selected_demo(request, account, db)
    return await _login(account, db, response)


@router.post("/refresh", response_model=AuthOut)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> AuthOut:
    result = await rotate_session(db, request.cookies.get(REFRESH_COOKIE, ""))
    if not result:
        raise HTTPException(401, "Invalid or expired session")
    account, access, new_refresh = result
    _cookies(response, access, new_refresh)
    await db.commit()
    return AuthOut(account=await _account_out(db, account))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> Response:
    refresh = request.cookies.get(REFRESH_COOKIE)
    if refresh:
        session = await db.scalar(select(AuthSession).where(AuthSession.refresh_hash == __import__("hashlib").sha256(refresh.encode()).hexdigest()))
        if session:
            session.revoked_at = __import__("app.repositories.orm", fromlist=["utcnow"]).utcnow()
            await db.commit()
    response.delete_cookie(ACCESS_COOKIE)
    response.delete_cookie(REFRESH_COOKIE)
    response.delete_cookie(CSRF_COOKIE)
    return response


@router.get("/me", response_model=AuthOut)
async def me(request: Request, db: AsyncSession = Depends(get_db)) -> AuthOut:
    token = request.cookies.get(ACCESS_COOKIE, "")
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        account = await db.get(UserAccount, uuid.UUID(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        account = None
    if not account or not account.is_active:
        raise HTTPException(401, "Not authenticated")
    return AuthOut(account=await _account_out(db, account))


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(body: AccountCreateIn, db: AsyncSession = Depends(get_db)) -> AccountOut:
    raise HTTPException(501, "Administrative account creation requires the persisted admin dependency")
