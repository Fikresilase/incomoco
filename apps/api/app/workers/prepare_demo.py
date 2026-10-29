"""Generate the shared demo with real configured models: python -m app.workers.prepare_demo."""
import asyncio
import hashlib
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.container import build_container
from app.core.db import SessionFactory
from app.repositories.orm import CoursePreparation, Document, Organization
from app.services.animated_courses import DEMO_RESOURCE_ID, AnimatedCourseWorker


async def main():
    settings = get_settings()
    if settings.ai_provider == "fake" or not settings.openrouter_api_key:
        raise RuntimeError("The demo requires real AI credentials; fake generation is not a demo")
    container = await asyncio.to_thread(build_container, settings)
    course_id = uuid.uuid5(DEMO_RESOURCE_ID, "demo-course")
    document_id = uuid.uuid5(DEMO_RESOURCE_ID, "demo-source")
    try:
        async with SessionFactory() as db:
            job = await db.get(CoursePreparation, course_id)
            if job and job.status == "ready":
                print("Shared demo is already prepared; reusing saved scenes and audio.", flush=True)
                return
            if job and job.status == "generating":
                raise RuntimeError("The demo is already being prepared")
            if not job:
                data = await asyncio.to_thread(lambda: (Path(__file__).resolve().parents[2] / "demo" / "cash-flow.md").read_bytes())
                key = f"documents/{document_id}/cash-flow.md"
                await asyncio.to_thread(container.blob_store.put, key, data, "text/markdown")
                db.add(Document(id=document_id, title="Cash flow demo source", filename="cash-flow.md",
                    mime="text/markdown", size_bytes=len(data), checksum=hashlib.sha256(data).hexdigest(),
                    storage_key=key, status="ready"))
                await db.flush()
                organization = await db.scalar(select(Organization).where(Organization.slug == "inkomoko"))
                job = CoursePreparation(id=course_id, document_id=document_id,
                    organization_id=organization.id if organization else None,
                    title="Cash flow basics", language="en", is_demo=True, status="generating", attempts=1)
                db.add(job)
            else:
                job.status, job.error = "generating", None
                job.attempts += 1
            await db.commit()
        print(f"Preparing shared demo with {settings.learning_animation_model} and {settings.learning_tts_model}", flush=True)
        try:
            await AnimatedCourseWorker(container).prepare(job)
        except Exception as exc:
            async with SessionFactory() as db:
                saved = await db.get(CoursePreparation, course_id)
                saved.status, saved.error = "failed", str(exc)[:1000]
                await db.commit()
            raise
        print(f"Demo ready: {DEMO_RESOURCE_ID}", flush=True)
    finally:
        await container.aclose()


if __name__ == "__main__":
    asyncio.run(main())
