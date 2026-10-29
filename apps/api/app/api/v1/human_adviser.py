"""Private adviser assignment and human messaging APIs."""

import asyncio
import io
import os
import subprocess
import uuid
import wave

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container, get_db, require_csrf, strict_account
from app.repositories.orm import (
    AccountRole,
    AdviserAssignment,
    AdviserRecommendation,
    AuthSession,
    EntrepreneurProfile,
    HumanConversation,
    HumanMessage,
    LearningResource,
    Notification,
    Role,
    UserAccount,
    utcnow,
)
from app.schemas.auth import AccountCreateIn
from app.services.auth import ensure_default_roles, hash_password, permission_keys, role_names

router = APIRouter(prefix="/human", tags=["human adviser"])
MAX_AUDIO_SECONDS = 300
SUPPORTED_AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg"}


class AssignmentIn(BaseModel):
    entrepreneur_profile_id: uuid.UUID
    adviser_account_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=240)


class MessageIn(BaseModel):
    text_body: str = Field(min_length=1, max_length=10000)


class RecommendationIn(BaseModel):
    learning_resource_id: uuid.UUID
    note: str | None = Field(default=None, max_length=2000)


def _probe_audio(data: bytes, content_type: str) -> tuple[str, float]:
    """Validate bytes, not browser metadata. WAV is decoded with stdlib; ffprobe covers WebM/OGG/MP3 when installed."""
    if content_type in {"audio/wav", "audio/x-wav"}:
        try:
            with wave.open(io.BytesIO(data)) as source:
                duration = source.getnframes() / max(source.getframerate(), 1)
                if source.getnchannels() < 1 or source.getsampwidth() < 1:
                    raise ValueError("invalid WAV stream")
        except (wave.Error, EOFError, ValueError) as exc:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Malformed WAV audio") from exc
    else:
        ffprobe = os.environ.get("FFPROBE_BIN", "ffprobe")
        try:
            result = subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "-"],
                input=data, capture_output=True, check=True, timeout=8,
            )
            duration = float(result.stdout.strip())
        except (FileNotFoundError, subprocess.SubprocessError, ValueError) as exc:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "This audio container is not enabled on the server") from exc
    if not 0 < duration <= MAX_AUDIO_SECONDS:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Audio must be {MAX_AUDIO_SECONDS} seconds or shorter")
    return content_type, duration


@router.get("/admin/advisers")
async def list_advisers(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    rows = (await db.scalars(select(UserAccount).join(AccountRole, AccountRole.account_id == UserAccount.id).join(Role, Role.id == AccountRole.role_id).where(UserAccount.organization_id == account.organization_id, Role.name == "adviser").order_by(UserAccount.display_name))).all()
    return [{"id": x.id, "email": x.email, "display_name": x.display_name, "is_active": x.is_active} for x in rows]


@router.get("/admin/entrepreneurs")
async def admin_entrepreneurs(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    profiles = (await db.scalars(
        select(EntrepreneurProfile)
        .where(
            or_(
                EntrepreneurProfile.organization_id == account.organization_id,
                and_(EntrepreneurProfile.is_demo.is_(True), EntrepreneurProfile.organization_id.is_(None)),
            )
        )
        .order_by(EntrepreneurProfile.updated_at.desc())
    )).all()
    result = []
    for profile in profiles:
        assignment = await _active_assignment(db, profile.id)
        adviser = await db.get(UserAccount, assignment.adviser_account_id) if assignment else None
        result.append({"id": profile.id, "name": profile.business_name or "Entrepreneur", "business_name": profile.business_name, "business_type": profile.business_type, "language": profile.preferred_language, "is_demo": profile.is_demo, "adviser": adviser.display_name if adviser else None, "adviser_account_id": adviser.id if adviser else None})
    return result


@router.get("/adviser/entrepreneurs")
async def adviser_entrepreneurs(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _adviser(account, db)
    rows = (await db.scalars(select(AdviserAssignment).where(AdviserAssignment.organization_id == account.organization_id, AdviserAssignment.adviser_account_id == account.id, AdviserAssignment.status == "active").order_by(AdviserAssignment.assigned_at.desc()))).all()
    result = []
    for assignment in rows:
        profile = await db.get(EntrepreneurProfile, assignment.entrepreneur_profile_id)
        if profile:
            result.append({"id": profile.id, "name": profile.business_name or "Entrepreneur", "business_name": profile.business_name, "business_type": profile.business_type, "language": profile.preferred_language, "assigned_at": assignment.assigned_at})
    return result


@router.post("/admin/advisers", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def create_adviser(body: AccountCreateIn, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    if body.role != "adviser":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only adviser accounts may be created here")
    if await db.scalar(select(UserAccount).where(UserAccount.email == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Account already exists")
    await ensure_default_roles(db)
    adviser_role = await db.scalar(select(Role).where(Role.name == "adviser"))
    created = UserAccount(email=body.email.lower(), password_hash=hash_password(body.password), display_name=body.display_name, organization_id=account.organization_id)
    db.add(created)
    await db.flush()
    db.add(AccountRole(account_id=created.id, role_id=adviser_role.id))
    await db.commit()
    return {"id": created.id, "email": created.email, "display_name": created.display_name, "is_active": created.is_active}


@router.post("/admin/advisers/{adviser_id}/deactivate", dependencies=[Depends(require_csrf)])
async def deactivate_adviser(adviser_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    adviser = await db.get(UserAccount, adviser_id)
    if not adviser or adviser.organization_id != account.organization_id or "adviser" not in set(await role_names(db, adviser.id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Adviser not found")
    adviser.is_active = False
    await db.execute(update(AuthSession).where(AuthSession.account_id == adviser.id, AuthSession.revoked_at.is_(None)).values(revoked_at=utcnow()))
    await db.commit()
    return {"ok": True}


async def _admin(account: UserAccount, db: AsyncSession) -> None:
    if "users.manage" not in await permission_keys(db, account.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Assignment administration required")


async def _adviser(account: UserAccount, db: AsyncSession) -> None:
    if "adviser" not in set(await role_names(db, account.id)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Adviser account required")


async def _active_assignment(db: AsyncSession, profile_id: uuid.UUID) -> AdviserAssignment | None:
    return await db.scalar(select(AdviserAssignment).where(AdviserAssignment.entrepreneur_profile_id == profile_id, AdviserAssignment.status == "active"))


async def _authorized_conversation(db: AsyncSession, account: UserAccount, conversation_id: uuid.UUID) -> HumanConversation:
    conversation = await db.get(HumanConversation, conversation_id)
    if not conversation or conversation.organization_id != account.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    assignment = await db.get(AdviserAssignment, conversation.adviser_assignment_id)
    roles = set(await role_names(db, account.id))
    allowed = (
        account.id == assignment.adviser_account_id and assignment.status == "active"
        or "entrepreneur" in roles
        and (await db.scalar(select(EntrepreneurProfile.id).where(EntrepreneurProfile.id == conversation.entrepreneur_profile_id, EntrepreneurProfile.user_id == account.id))) is not None
    )
    if not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


@router.post("/assignments", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def assign(body: AssignmentIn, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    profile = await db.get(EntrepreneurProfile, body.entrepreneur_profile_id)
    adviser = await db.get(UserAccount, body.adviser_account_id)
    if not profile or (
        profile.organization_id != account.organization_id
        and not (profile.is_demo and profile.organization_id is None)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entrepreneur not found")
    if not adviser or adviser.organization_id != account.organization_id or not adviser.is_active or "adviser" not in set(await role_names(db, adviser.id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account is not an active adviser")
    # Demo profiles are intentionally unscoped until an admin explicitly assigns one.
    if profile.organization_id is None and profile.is_demo:
        profile.organization_id = account.organization_id
    current = await _active_assignment(db, profile.id)
    if current and current.adviser_account_id == adviser.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Entrepreneur is already assigned")
    if current:
        current.status, current.ended_at = "ended", utcnow()
    assignment = AdviserAssignment(organization_id=account.organization_id, entrepreneur_profile_id=profile.id, adviser_account_id=adviser.id, assigned_by_account_id=account.id, reason=body.reason)
    db.add(assignment)
    await db.flush()
    db.add(Notification(recipient_account_id=adviser.id, event_type="adviser_assigned", related_entity_id=assignment.id))
    await db.commit()
    return {"id": assignment.id, "status": assignment.status, "adviser_account_id": adviser.id, "entrepreneur_profile_id": profile.id}


@router.get("/assignments")
async def assignments(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    roles = set(await role_names(db, account.id))
    query = select(AdviserAssignment).where(AdviserAssignment.organization_id == account.organization_id, AdviserAssignment.status == "active")
    if "adviser" in roles:
        query = query.where(AdviserAssignment.adviser_account_id == account.id)
    elif "entrepreneur" in roles:
        query = query.join(EntrepreneurProfile, EntrepreneurProfile.id == AdviserAssignment.entrepreneur_profile_id).where(EntrepreneurProfile.user_id == account.id)
    elif "users.manage" not in await permission_keys(db, account.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    rows = (await db.scalars(query.order_by(AdviserAssignment.assigned_at.desc()))).all()
    result = []
    for assignment in rows:
        profile = await db.get(EntrepreneurProfile, assignment.entrepreneur_profile_id)
        adviser = await db.get(UserAccount, assignment.adviser_account_id)
        result.append({"id": assignment.id, "entrepreneur_profile_id": assignment.entrepreneur_profile_id, "adviser_account_id": assignment.adviser_account_id, "assigned_at": assignment.assigned_at, "name": profile.business_name if profile else "Entrepreneur", "business_name": profile.business_name if profile else None, "business_type": profile.business_type if profile else None, "language": profile.preferred_language if profile else "am", "adviser_name": adviser.display_name if adviser else None})
    return result


@router.get("/admin/assignments/history")
async def assignment_history(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    rows = (await db.scalars(select(AdviserAssignment).where(AdviserAssignment.organization_id == account.organization_id).order_by(AdviserAssignment.assigned_at.desc()))).all()
    result = []
    for assignment in rows:
        profile = await db.get(EntrepreneurProfile, assignment.entrepreneur_profile_id)
        adviser = await db.get(UserAccount, assignment.adviser_account_id)
        actor = await db.get(UserAccount, assignment.assigned_by_account_id)
        result.append({
            "id": assignment.id,
            "entrepreneur_profile_id": assignment.entrepreneur_profile_id,
            "entrepreneur_name": profile.business_name if profile else "Entrepreneur",
            "adviser_account_id": assignment.adviser_account_id,
            "adviser_name": adviser.display_name if adviser else "Adviser",
            "assigned_by_account_id": assignment.assigned_by_account_id,
            "assigned_by_name": actor.display_name if actor else "Admin",
            "status": assignment.status,
            "assigned_at": assignment.assigned_at,
            "ended_at": assignment.ended_at,
            "reason": assignment.reason,
        })
    return result


@router.post("/admin/assignments/{assignment_id}/remove", dependencies=[Depends(require_csrf)])
async def remove_assignment(assignment_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _admin(account, db)
    assignment = await db.get(AdviserAssignment, assignment_id)
    if not assignment or assignment.organization_id != account.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    if assignment.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Assignment is already inactive")
    assignment.status = "ended"
    assignment.ended_at = utcnow()
    await db.commit()
    return {"id": assignment.id, "status": assignment.status, "ended_at": assignment.ended_at}


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def send_message(conversation_id: uuid.UUID, body: MessageIn, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    conversation = await _authorized_conversation(db, account, conversation_id)
    message = HumanMessage(conversation_id=conversation.id, sender_account_id=account.id, message_type="text", text_body=body.text_body)
    db.add(message)
    await db.flush()
    assignment = await db.get(AdviserAssignment, conversation.adviser_assignment_id)
    recipient = conversation.entrepreneur_profile_id
    if account.id == assignment.adviser_account_id:
        recipient_account_id = await db.scalar(select(EntrepreneurProfile.user_id).where(EntrepreneurProfile.id == recipient))
    else:
        recipient_account_id = assignment.adviser_account_id
    if recipient_account_id:
        db.add(Notification(recipient_account_id=recipient_account_id, event_type="new_human_message", related_entity_id=message.id))
    await db.commit()
    return {"id": message.id, "conversation_id": message.conversation_id, "sender_account_id": message.sender_account_id, "message_type": message.message_type, "text_body": message.text_body, "created_at": message.created_at}


@router.post("/conversations/{profile_id}", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def open_conversation(profile_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    assignment = await _active_assignment(db, profile_id)
    if not assignment or assignment.organization_id != account.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active adviser assignment")
    roles = set(await role_names(db, account.id))
    if account.id != assignment.adviser_account_id and not ("entrepreneur" in roles and await db.scalar(select(EntrepreneurProfile.id).where(EntrepreneurProfile.id == profile_id, EntrepreneurProfile.user_id == account.id))):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    conversation = await db.scalar(select(HumanConversation).where(HumanConversation.adviser_assignment_id == assignment.id, HumanConversation.status == "open"))
    if not conversation:
        conversation = HumanConversation(organization_id=assignment.organization_id, entrepreneur_profile_id=profile_id, adviser_assignment_id=assignment.id)
        db.add(conversation)
        await db.commit()
    return {"id": conversation.id, "entrepreneur_profile_id": profile_id, "adviser_assignment_id": assignment.id, "status": conversation.status}


@router.get("/conversations/{profile_id}")
async def get_conversation(profile_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    assignment = await _active_assignment(db, profile_id)
    if not assignment or assignment.organization_id != account.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active adviser assignment")
    roles = set(await role_names(db, account.id))
    owns_profile = await db.scalar(select(EntrepreneurProfile.id).where(EntrepreneurProfile.id == profile_id, EntrepreneurProfile.user_id == account.id))
    if account.id != assignment.adviser_account_id and not ("entrepreneur" in roles and owns_profile):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    conversation = await db.scalar(select(HumanConversation).where(HumanConversation.adviser_assignment_id == assignment.id, HumanConversation.status == "open"))
    return {"id": conversation.id, "entrepreneur_profile_id": profile_id, "adviser_assignment_id": assignment.id, "status": conversation.status} if conversation else None


@router.get("/conversations/{conversation_id}/messages")
async def messages(conversation_id: uuid.UUID, before: uuid.UUID | None = Query(default=None), limit: int = Query(default=50, ge=1, le=100), account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _authorized_conversation(db, account, conversation_id)
    query = select(HumanMessage).where(HumanMessage.conversation_id == conversation_id).order_by(HumanMessage.created_at.desc()).limit(limit)
    if before:
        pivot = await db.get(HumanMessage, before)
        if pivot:
            query = query.where(HumanMessage.created_at < pivot.created_at)
    rows = list((await db.scalars(query)).all())
    return [{"id": x.id, "sender_account_id": x.sender_account_id, "message_type": x.message_type, "text_body": x.text_body, "created_at": x.created_at, "read_at": x.read_at} for x in reversed(rows)]


@router.get("/notifications")
async def notifications(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(Notification).where(Notification.recipient_account_id == account.id).order_by(Notification.created_at.desc()).limit(100))).all()
    return [{"id": x.id, "event_type": x.event_type, "related_entity_id": x.related_entity_id, "title": x.title, "body": x.body, "created_at": x.created_at, "read_at": x.read_at} for x in rows]


@router.get("/notifications/unread-count")
async def notification_unread_count(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count(Notification.id)).where(Notification.recipient_account_id == account.id, Notification.read_at.is_(None)))
    return {"count": count or 0}


@router.post("/notifications/{notification_id}/read", dependencies=[Depends(require_csrf)])
async def mark_notification_read(notification_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.recipient_account_id == account.id))
    if row:
        row.read_at = utcnow()
        await db.commit()
    return {"ok": True}


@router.post("/conversations/{conversation_id}/read", dependencies=[Depends(require_csrf)])
async def mark_messages_read(conversation_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    await _authorized_conversation(db, account, conversation_id)
    await db.execute(HumanMessage.__table__.update().where(HumanMessage.conversation_id == conversation_id, HumanMessage.sender_account_id != account.id, HumanMessage.read_at.is_(None)).values(read_at=utcnow()))
    await db.commit()
    return {"ok": True}


@router.get("/conversations/unread-count")
async def human_unread_count(account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(HumanConversation).join(AdviserAssignment, HumanConversation.adviser_assignment_id == AdviserAssignment.id).where(HumanConversation.organization_id == account.organization_id))).all()
    total = 0
    for conversation in rows:
        try:
            await _authorized_conversation(db, account, conversation.id)
        except HTTPException:
            continue
        total += await db.scalar(select(func.count(HumanMessage.id)).where(HumanMessage.conversation_id == conversation.id, HumanMessage.sender_account_id != account.id, HumanMessage.read_at.is_(None))) or 0
    return {"count": total}


@router.post("/conversations/{conversation_id}/audio", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def upload_audio(conversation_id: uuid.UUID, audio: UploadFile = File(...), account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db), container=Depends(get_container)):
    conversation = await _authorized_conversation(db, account, conversation_id)
    content_type = audio.content_type or ""
    if content_type not in SUPPORTED_AUDIO_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported audio format")
    data = await audio.read(container.settings.max_upload_bytes + 1)
    if not data or len(data) >= container.settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Audio file is too large")
    content_type, duration = _probe_audio(data, content_type)
    key = f"human-voice/{conversation.organization_id}/{conversation.id}/{uuid.uuid4()}"
    await asyncio.to_thread(container.blob_store.put, key, data, content_type)
    try:
        message = HumanMessage(conversation_id=conversation.id, sender_account_id=account.id, message_type="audio", audio_storage_key=key, audio_content_type=content_type, audio_duration_seconds=duration)
        db.add(message)
        await db.flush()
        assignment = await db.get(AdviserAssignment, conversation.adviser_assignment_id)
        recipient_id = assignment.adviser_account_id if account.id != assignment.adviser_account_id else await db.scalar(select(EntrepreneurProfile.user_id).where(EntrepreneurProfile.id == conversation.entrepreneur_profile_id))
        if recipient_id:
            db.add(Notification(recipient_account_id=recipient_id, event_type="new_voice_note", related_entity_id=message.id))
        await db.commit()
    except Exception:
        await db.rollback()
        await asyncio.to_thread(container.blob_store.delete, key)
        raise
    return {"id": message.id, "message_type": "audio", "created_at": message.created_at}


@router.get("/messages/{message_id}/audio")
async def audio_url(message_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db), container=Depends(get_container)):
    message = await db.get(HumanMessage, message_id)
    if not message or message.message_type != "audio":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio message not found")
    await _authorized_conversation(db, account, message.conversation_id)
    data = await asyncio.to_thread(container.blob_store.get, message.audio_storage_key)
    return StreamingResponse(io.BytesIO(data), media_type=message.audio_content_type or "audio/wav", headers={"Cache-Control": "private, no-store"})


@router.get("/recommendations/{profile_id}")
async def recommendations(profile_id: uuid.UUID, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    assignment = await _active_assignment(db, profile_id)
    if not assignment or assignment.organization_id != account.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    roles = set(await role_names(db, account.id))
    if account.id != assignment.adviser_account_id and not ("entrepreneur" in roles and await db.scalar(select(EntrepreneurProfile.id).where(EntrepreneurProfile.id == profile_id, EntrepreneurProfile.user_id == account.id))):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    rows = (await db.execute(select(AdviserRecommendation, LearningResource).join(LearningResource, LearningResource.id == AdviserRecommendation.learning_resource_id).where(AdviserRecommendation.adviser_assignment_id == assignment.id).order_by(AdviserRecommendation.created_at.desc()))).all()
    return [{"id": rec.id, "learning_resource_id": resource.id, "title": resource.title, "note": rec.note, "created_at": rec.created_at} for rec, resource in rows]


@router.post("/recommendations/{profile_id}", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def recommend(profile_id: uuid.UUID, body: RecommendationIn, account: UserAccount = Depends(strict_account), db: AsyncSession = Depends(get_db)):
    assignment = await _active_assignment(db, profile_id)
    if not assignment or assignment.adviser_account_id != account.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    resource = await db.get(LearningResource, body.learning_resource_id)
    if not resource or resource.approval_status != "approved" or not resource.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only approved active resources may be recommended")
    row = AdviserRecommendation(organization_id=account.organization_id, adviser_assignment_id=assignment.id, entrepreneur_profile_id=profile_id, adviser_account_id=account.id, learning_resource_id=resource.id, note=body.note)
    db.add(row)
    recipient_id = await db.scalar(select(EntrepreneurProfile.user_id).where(EntrepreneurProfile.id == profile_id))
    if recipient_id:
        await db.flush()
        db.add(Notification(recipient_account_id=recipient_id, event_type="adviser_recommendation", related_entity_id=row.id, title="Your adviser recommended a course", body=body.note or resource.title))
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Resource already recommended") from None
    return {"id": row.id, "learning_resource_id": row.learning_resource_id, "note": row.note}
