import asyncio
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container, get_db, require_csrf, session_id_from, strict_account
from app.repositories.orm import (
    CoursePreparation,
    EntrepreneurProfile,
    LearningProgress,
    LearningResource,
    LessonPlayback,
    utcnow,
)
from app.schemas.animated_learning import AnswerIn, PositionIn
from app.services.animated_courses import DEMO_RESOURCE_ID
from app.services.auth import role_names
from app.services.document_service import DocumentService, UploadError
from app.services.lesson_checkpoints import allowed_position, first_locked, public_module

router = APIRouter(tags=["animated learning"])


async def course_author(request: Request, db: AsyncSession = Depends(get_db)):
    account = await strict_account(request, db)
    if not set(await role_names(db, account.id)) & {"adviser", "admin", "super_admin"}:
        raise HTTPException(403, "Only advisers and administrators can prepare courses")
    return account


async def learner_id(request, db):
    if request.cookies.get("inkomoko_access"):
        return (await strict_account(request, db)).id
    return session_id_from(request)


async def author_course(course_id, account, db):
    job = await db.get(CoursePreparation, course_id)
    if not job or job.organization_id != account.organization_id:
        raise HTTPException(404, "Course not found")
    return job


@router.get("/adviser/courses")
async def courses(account=Depends(course_author), db: AsyncSession = Depends(get_db)):
    jobs = (await db.scalars(select(CoursePreparation).where(
        CoursePreparation.organization_id == account.organization_id,
    ).order_by(CoursePreparation.created_at.desc()))).all()
    result = []
    for job in jobs:
        lessons = (await db.scalars(select(LearningResource).where(
            LearningResource.course_key == f"course-{job.id}",
        ).order_by(LearningResource.chapter_number))).all()
        result.append({"id": str(job.id), "title": job.title, "language": job.language,
            "status": job.status, "attempts": job.attempts, "error": job.error,
            "lessons": [{"id": str(r.id), "title": r.title, "status": r.approval_status,
                "ready": (r.lesson_content or {}).get("animated", {}).get("status") == "ready"} for r in lessons]})
    return result


@router.post("/adviser/courses", status_code=202, dependencies=[Depends(require_csrf)])
async def upload_course(request: Request, file: UploadFile = File(...), language: Literal["en", "am", "om", "so"] = Form(...),
    account=Depends(course_author), db: AsyncSession = Depends(get_db), container=Depends(get_container)):
    data = await file.read(container.settings.max_upload_bytes + 1)
    try:
        document = await DocumentService(container).upload(db, file.filename or "document", data, commit=False)
    except UploadError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    job = CoursePreparation(document_id=document.id, owner_id=account.id,
        organization_id=account.organization_id, title=document.title, language=language)
    db.add(job)
    await db.commit()
    return {"id": str(job.id), "status": job.status}


@router.post("/adviser/courses/{course_id}/retry", dependencies=[Depends(require_csrf)])
async def retry(course_id: uuid.UUID, account=Depends(course_author), db: AsyncSession = Depends(get_db)):
    job = await author_course(course_id, account, db)
    if job.status != "failed":
        raise HTTPException(409, "Only failed courses can be retried")
    job.status, job.attempts, job.error, job.updated_at = "queued", 0, None, utcnow()
    await db.commit()
    return {"status": job.status}


@router.post("/adviser/courses/{course_id}/publish", dependencies=[Depends(require_csrf)])
async def publish(course_id: uuid.UUID, account=Depends(course_author), db: AsyncSession = Depends(get_db)):
    job = await author_course(course_id, account, db)
    if job.status != "ready":
        raise HTTPException(409, "Wait for every lesson to finish before publishing")
    lessons = (await db.scalars(select(LearningResource).where(LearningResource.course_key == f"course-{job.id}"))).all()
    if not lessons or any((r.lesson_content or {}).get("animated", {}).get("status") != "ready" for r in lessons):
        raise HTTPException(409, "The course has unfinished lessons")
    for resource in lessons:
        resource.approval_status, resource.is_active, resource.updated_at = "approved", True, utcnow()
    await db.commit()
    return {"status": "published"}


async def lesson_resource(resource_id, request, db, *, preview=False):
    try:
        resource_uuid = DEMO_RESOURCE_ID if resource_id == "demo" else uuid.UUID(str(resource_id))
    except ValueError:
        raise HTTPException(404, "Lesson not found") from None
    resource = await db.get(LearningResource, resource_uuid)
    if not resource:
        raise HTTPException(404, "This animated lesson has not been prepared yet")
    if preview:
        account = await course_author(request, db)
        job = await db.scalar(select(CoursePreparation).where(
            CoursePreparation.document_id == resource.document_id,
            CoursePreparation.organization_id == account.organization_id))
        if not job:
            raise HTTPException(404, "Lesson not found")
    elif resource.approval_status != "approved" or not resource.is_active:
        raise HTTPException(404, "Lesson not published")
    module = (resource.lesson_content or {}).get("animated")
    if not module or module.get("status") != "ready":
        raise HTTPException(409, "This lesson is still being prepared")
    return resource, module


async def playback_for(request, db, resource, module):
    identity = await learner_id(request, db)
    await db.execute(insert(LessonPlayback).values(learner_id=identity, resource_id=resource.id,
        version=resource.version or "1", position_ms=0, answers={}, completed=False).on_conflict_do_nothing())
    playback = await db.scalar(select(LessonPlayback).where(LessonPlayback.learner_id == identity,
        LessonPlayback.resource_id == resource.id).with_for_update())
    if playback.version != resource.version:
        playback.version, playback.position_ms, playback.answers, playback.completed = resource.version, 0, {}, False
    return playback


def playback_out(playback):
    return {"position_ms": playback.position_ms, "answers": playback.answers, "completed": playback.completed,
        "version": playback.version}


@router.get("/learning/animated/config")
async def animated_config(container=Depends(get_container)):
    return {"demo_mode": container.settings.learning_demo_mode}


@router.get("/learning/animated/{resource_id}")
async def module_get(resource_id: str, request: Request, preview: bool = False,
    db: AsyncSession = Depends(get_db)):
    resource, module = await lesson_resource(resource_id, request, db, preview=preview)
    playback = await playback_for(request, db, resource, module)
    await db.commit()
    safe = public_module(module)
    safe["version"] = resource.version or "1"
    safe.pop("audio_key", None)
    safe["scenes"] = [{**s, "audio": {"duration_ms": s["end_ms"] - s["start_ms"]}} for s in module["scenes"]]
    return {"id": str(resource.id), "module": safe, "progress": playback_out(playback)}


@router.get("/learning/animated/{resource_id}/audio")
async def lesson_audio(resource_id: str, request: Request, preview: bool = False,
    db: AsyncSession = Depends(get_db), container=Depends(get_container)):
    _, module = await lesson_resource(resource_id, request, db, preview=preview)
    data = await asyncio.to_thread(container.blob_store.get, module["audio_key"])
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"}
    byte_range = request.headers.get("range")
    if byte_range:
        try:
            unit, value = byte_range.split("=", 1)
            start, end = value.split("-", 1)
            if unit != "bytes" or "," in value:
                raise ValueError()
            first = int(start) if start else max(0, len(data) - int(end))
            last = min(int(end), len(data) - 1) if start and end else len(data) - 1
            if first < 0 or first > last or first >= len(data):
                raise ValueError()
        except ValueError:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{len(data)}"})
        headers["Content-Range"] = f"bytes {first}-{last}/{len(data)}"
        return Response(data[first:last + 1], status_code=206, media_type="audio/wav", headers=headers)
    return Response(data, media_type="audio/wav", headers=headers)


@router.put("/learning/animated/{resource_id}/progress")
async def save_progress(resource_id: str, body: PositionIn, request: Request, preview: bool = False,
    db: AsyncSession = Depends(get_db)):
    if request.cookies.get("inkomoko_access"):
        await require_csrf(request)
    resource, module = await lesson_resource(resource_id, request, db, preview=preview)
    if body.version != resource.version:
        raise HTTPException(409, "Lesson changed; reopen it to load the current version")
    playback = await playback_for(request, db, resource, module)
    playback.position_ms = allowed_position(module, playback.answers, body.position_ms)
    playback.updated_at = utcnow()
    playback.completed = playback.completed or (first_locked(module, playback.answers) is None and playback.position_ms >= module["duration_ms"] - 500)
    if playback.completed and not preview:
        profile = await db.scalar(select(EntrepreneurProfile).where(EntrepreneurProfile.session_id == session_id_from(request)))
        if profile:
            await db.execute(insert(LearningProgress).values(profile_id=profile.id, skill_id=resource.skill_id,
                resource_id=resource.id, status="completed", started_at=utcnow(), completed_at=utcnow(),
                completion_evidence="animated_checkpoints_completed").on_conflict_do_update(
                    index_elements=[LearningProgress.profile_id, LearningProgress.resource_id],
                    set_={"status": "completed", "completed_at": utcnow(), "last_activity_at": utcnow()}))
    await db.commit()
    return playback_out(playback)


@router.post("/learning/animated/{resource_id}/answer")
async def answer(resource_id: str, body: AnswerIn, request: Request, preview: bool = False,
    db: AsyncSession = Depends(get_db)):
    if request.cookies.get("inkomoko_access"):
        await require_csrf(request)
    resource, module = await lesson_resource(resource_id, request, db, preview=preview)
    if body.version != resource.version:
        raise HTTPException(409, "Lesson changed; reopen it")
    playback = await playback_for(request, db, resource, module)
    question = next((q for q in module["checkpoints"] if q["id"] == body.checkpoint_id), None)
    locked = first_locked(module, playback.answers)
    if not question or (locked and question["at_ms"] > locked["at_ms"]):
        raise HTTPException(409, "Complete the earlier checkpoint first")
    if body.option >= len(question["options"]) or body.position_ms < question["at_ms"] - 500:
        raise HTTPException(422, "Watch this section and choose one of its answers")
    previous = playback.answers.get(question["id"], {})
    correct = body.option == question["answer"]
    result = {"option": body.option, "correct": correct or previous.get("correct", False),
        "attempts": previous.get("attempts", 0) + 1}
    playback.answers = {**playback.answers, question["id"]: result}
    playback.position_ms = allowed_position(module, playback.answers, body.position_ms)
    playback.updated_at = utcnow()
    await db.commit()
    return {"correct": correct, "explanation": question["explanation"] if correct else "Try again. Review the explanation above and choose another answer.",
        "progress": playback_out(playback)}
