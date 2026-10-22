"""Dictation (speech-to-text) and read-aloud (TTS stored in MinIO) use cases."""

import asyncio
import hashlib
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audio import join_wav, wav_duration_ms
from app.core.container import Container
from app.domain.models import ChatTurn, Lang
from app.rag.generation.speech_text import split_sentences
from app.rag.language import coerce_lang, detect_lang
from app.repositories.chat_repo import ChatRepository
from app.services.chat_service import NotFoundError

_TTS_CONCURRENCY = 4


class UnsupportedTTSLanguage(ValueError):
    pass


def tts_key(message_id: uuid.UUID, audio_format: str) -> str:
    return f"tts/{message_id}.{audio_format}"


def tts_text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def tts_cache_key(message_id: uuid.UUID, audio_format: str, *, lang: str, model: str, voice: str, text: str) -> str:
    digest = tts_text_hash(text)[:16]
    safe_model = "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in model)[:80]
    safe_voice = "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in voice)[:40]
    return f"tts/{message_id}/{lang}/{safe_model}/{safe_voice}/{digest}.{audio_format}"


class VoiceService:
    def __init__(self, container: Container):
        self.c = container

    async def transcribe(
        self,
        audio: bytes,
        audio_format: str = "wav",
        context: list[ChatTurn] | None = None,
        *,
        language_hint: str | None = None,
    ) -> tuple[str, Lang]:
        hint = coerce_lang(language_hint)
        text = await self.c.stt.transcribe(audio, audio_format, context, language_hint=hint)
        return text, hint or detect_lang(text)

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
        if not self.c.tts.supports(lang):
            raise UnsupportedTTSLanguage(f"TTS is not enabled for language {lang!r}")
        cache_id = uuid.uuid5(uuid.NAMESPACE_URL, f"dashboard:{lang}:{text}")
        tts = self.c.tts
        key = tts_cache_key(cache_id, tts.audio_format, lang=lang, model=tts.model, voice=tts.voice, text=text)
        try:
            return await asyncio.to_thread(self.c.blob_store.get, key)
        except Exception:
            pass
        pieces = split_sentences(text)
        if not pieces:
            return b""
        semaphore = asyncio.Semaphore(_TTS_CONCURRENCY)

        async def one(piece: str) -> bytes:
            async with semaphore:
                return await self.c.tts.synthesize(piece, lang)

        audio = join_wav(list(await asyncio.gather(*(one(p) for p in pieces))))
        if audio:
            await asyncio.to_thread(self.c.blob_store.put, key, audio, tts.content_type)
        return audio

    async def store_audio(self, db: AsyncSession, message_id: uuid.UUID, audio: bytes) -> None:
        tts = self.c.tts
        message = await ChatRepository(db).get_message(message_id)
        if message is None:
            raise NotFoundError("Message not found")
        text_hash = tts_text_hash(message.content)
        key = tts_cache_key(
            message_id, tts.audio_format, lang=message.lang, model=tts.model, voice=tts.voice, text=message.content
        )
        await asyncio.to_thread(self.c.blob_store.put, key, audio, tts.content_type)
        await ChatRepository(db).save_audio(
            message_id,
            key,
            tts.audio_format,
            tts.voice,
            tts.model,
            message.lang,
            text_hash,
            duration_ms=wav_duration_ms(audio),
        )

    async def speak_message(self, db: AsyncSession, session_id: uuid.UUID, message_id: uuid.UUID) -> bytes:
        """Replay stored TTS from MinIO, or synthesize once, store, and return it."""
        message = await ChatRepository(db).get_session_message(message_id, session_id)
        if message is None or message.role != "assistant":
            raise NotFoundError("Message not found")
        expected_hash = tts_text_hash(message.content)
        tts = self.c.tts
        if (
            message.audio is not None
            and message.audio.lang == message.lang
            and message.audio.model == tts.model
            and message.audio.voice == tts.voice
            and message.audio.format == tts.audio_format
            and message.audio.text_hash == expected_hash
        ):
            return await asyncio.to_thread(self.c.blob_store.get, message.audio.storage_key)

        audio = await self.synthesize_text(message.content, message.lang)
        if not audio:
            raise NotFoundError("Nothing to read aloud")
        await self.store_audio(db, message.id, audio)
        await db.commit()
        return audio
