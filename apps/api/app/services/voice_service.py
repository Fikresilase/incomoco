"""Dictation (speech-to-text) and read-aloud (TTS stored in MinIO) use cases."""

import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audio import join_wav, wav_duration_ms
from app.core.container import Container
from app.domain.models import ChatTurn, Lang
from app.rag.generation.speech_text import split_sentences
from app.rag.language import detect_lang
from app.repositories.chat_repo import ChatRepository
from app.services.chat_service import NotFoundError

_TTS_CONCURRENCY = 4


def tts_key(message_id: uuid.UUID, audio_format: str) -> str:
    return f"tts/{message_id}.{audio_format}"


class VoiceService:
    def __init__(self, container: Container):
        self.c = container

    async def transcribe(
        self, audio: bytes, audio_format: str = "wav", context: list[ChatTurn] | None = None
    ) -> tuple[str, Lang]:
        text = await self.c.stt.transcribe(audio, audio_format, context)
        return text, detect_lang(text)

    async def recent_context(
        self, db: AsyncSession, session_id: uuid.UUID, conversation_id: uuid.UUID | None
    ) -> list[ChatTurn]:
        """Last few turns of the user's own conversation, used to bias transcription."""
        if conversation_id is None:
            return []
        repo = ChatRepository(db)
        if await repo.get_conversation(conversation_id, session_id) is None:
            return []
        return await repo.history(conversation_id, self.c.settings.stt_context_turns)

    async def synthesize_text(self, text: str, lang: str) -> bytes:
        """Synthesize long text sentence-group by sentence-group in parallel; MP3 frames concatenate."""
        pieces = split_sentences(text)
        if not pieces:
            return b""
        semaphore = asyncio.Semaphore(_TTS_CONCURRENCY)

        async def one(piece: str) -> bytes:
            async with semaphore:
                return await self.c.tts.synthesize(piece, lang)

        return join_wav(list(await asyncio.gather(*(one(p) for p in pieces))))

    async def store_audio(self, db: AsyncSession, message_id: uuid.UUID, audio: bytes) -> None:
        tts = self.c.tts
        key = tts_key(message_id, tts.audio_format)
        await asyncio.to_thread(self.c.blob_store.put, key, audio, tts.content_type)
        await ChatRepository(db).save_audio(
            message_id, key, tts.audio_format, tts.voice, tts.model, duration_ms=wav_duration_ms(audio)
        )

    async def speak_message(self, db: AsyncSession, session_id: uuid.UUID, message_id: uuid.UUID) -> bytes:
        """Replay stored TTS from MinIO, or synthesize once, store, and return it."""
        message = await ChatRepository(db).get_session_message(message_id, session_id)
        if message is None or message.role != "assistant":
            raise NotFoundError("Message not found")
        if message.audio is not None:
            return await asyncio.to_thread(self.c.blob_store.get, message.audio.storage_key)

        audio = await self.synthesize_text(message.content, message.lang)
        if not audio:
            raise NotFoundError("Nothing to read aloud")
        await self.store_audio(db, message.id, audio)
        await db.commit()
        return audio
