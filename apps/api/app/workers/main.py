"""Worker entrypoint: `python -m app.workers.main`.

Polls the Postgres job queue and regenerates the knowledge-gap report on a schedule.
"""

import asyncio
import logging
import signal
import time

from app.core.config import get_settings
from app.core.container import build_container
from app.core.db import SessionFactory
from app.core.logging import setup_logging
from app.repositories.document_repo import DocumentRepository
from app.services.analytics_service import AnalyticsService
from app.workers.ingest_worker import IngestionWorker

logger = logging.getLogger("worker")


async def main() -> None:
    setup_logging()
    settings = get_settings()
    container = await asyncio.to_thread(build_container, settings)
    worker = IngestionWorker(container)
    analytics = AnalyticsService(container)
    stop = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass

    async with SessionFactory() as db:
        requeued = await DocumentRepository(db).requeue_stale_jobs()
        await db.commit()
    logger.info("Worker started (requeued %s stale jobs)", requeued)

    next_gap_report = time.monotonic() + 60
    try:
        while not stop.is_set():
            try:
                busy = await worker.run_once()
                if time.monotonic() >= next_gap_report:
                    next_gap_report = time.monotonic() + settings.gap_report_interval_minutes * 60
                    async with SessionFactory() as db:
                        await analytics.refresh_gaps(db)
                    logger.info("Knowledge-gap report refreshed")
            except Exception:
                logger.exception("Worker loop error")
                busy = False
            if not busy:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
                except TimeoutError:
                    pass
    finally:
        await container.aclose()
        logger.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
