"""Run with `python -m app.commands.cleanup_human_audio`."""

import asyncio
import logging

from app.core.config import get_settings
from app.core.container import build_container
from app.core.db import SessionFactory
from app.core.logging import setup_logging
from app.services.human_audio_cleanup import cleanup_orphaned_human_audio


async def main() -> None:
    setup_logging()
    settings = get_settings()
    container = await asyncio.to_thread(build_container, settings)
    try:
        async with SessionFactory() as db:
            removed = await cleanup_orphaned_human_audio(db, container.blob_store, settings.human_audio_orphan_ttl_minutes)
            await db.commit()
        logging.getLogger(__name__).info("Removed %s abandoned human audio objects", removed)
    finally:
        await container.aclose()


if __name__ == "__main__":
    asyncio.run(main())
