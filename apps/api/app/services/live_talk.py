"""Live talk over WebSocket (design doc §6.4 and docs/api-contract.md).

Per utterance: STT → user.transcript → RAG answer streamed as text → sentence-level TTS sent in
order → full audio stored in MinIO. Barge-in cancels the running turn.
"""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import Callable

from fastapi import WebSocket, WebSocketDisconnect

from app.core.audio import join_wav, prepend_silence
from app.core.container import Container
from app.core.db import SessionFactory
from app.rag.generation.speech_text import SentenceSplitter
from app.repositories.chat_repo import ChatRepository
from app.services.chat_service import ChatService, TurnContext
from app.services.voice_service import VoiceService

logger = logging.getLogger(__name__)

PLACEHOLDER_TITLE = "Voice conversation"
MAX_UTTERANCE_BYTES = 5 * 1024 * 1024  # ~2.5 min of 16 kHz PCM16


class LiveTalkSession:
    def __init__(self, ws: WebSocket, container: Container, session_id: uuid.UUID):
        self.ws = ws
        self.c = container
        self.session_id = session_id
        self.chat = ChatService(container)
        self.voice = VoiceService(container)
        self.conversation_id: uuid.UUID | None = None
        self._send_lock = asyncio.Lock()
        self._turn: asyncio.Task | None = None

    # ---- transport --------------------------------------------------------------

    async def send(self, event: str, **data) -> None:
        async with self._send_lock:
            await self.ws.send_text(json.dumps({"type": event, **data}, ensure_ascii=False))

    async def send_audio(self, index: int, audio: bytes) -> None:
        async with self._send_lock:  # JSON header + binary frame must stay adjacent
            await self.ws.send_text(
                json.dumps({"type": "agent.audio", "index": index, "format": self.c.tts.audio_format})
            )
            await self.ws.send_bytes(audio)

    async def run(self) -> None:
        await self.ws.accept()
        try:
            while True:
                message = await self.ws.receive()
                if message["type"] == "websocket.disconnect":
                    break
                if message.get("bytes") is not None:
                    await self._on_utterance(message["bytes"])
                elif message.get("text") is not None:
                    if not await self._on_control(json.loads(message["text"])):
                        break
        except WebSocketDisconnect:
            pass
        finally:
            await self._cancel_turn()
            await self._drop_empty_conversation()

    # ---- control ----------------------------------------------------------------

    async def _on_control(self, payload: dict) -> bool:
        kind = payload.get("type")
        if kind == "session.start":
            await self._start_session(payload.get("conversation_id"))
        elif kind == "interrupt":
            if await self._cancel_turn():
                await self.send("turn.done", agent_message_id=None, interrupted=True, no_answer=False)
        elif kind == "session.end":
            return False
        return True

    async def _start_session(self, conversation_id: str | None) -> None:
        async with SessionFactory() as db:
            repo = ChatRepository(db)
            await repo.touch_session(self.session_id, None)
            conversation = None
            if conversation_id:
                conversation = await repo.get_conversation(uuid.UUID(conversation_id), self.session_id)
            if conversation is None:
                conversation = await repo.create_conversation(self.session_id, PLACEHOLDER_TITLE)
            await db.commit()
            self.conversation_id = conversation.id
        await self.send("session.ready", conversation_id=str(self.conversation_id))

    async def _cancel_turn(self) -> bool:
        if self._turn is None or self._turn.done():
            return False
        self._turn.cancel()
        try:
            await self._turn
        except (asyncio.CancelledError, Exception):
            pass
        return True

    # ---- turns ------------------------------------------------------------------

    async def _on_utterance(self, audio: bytes) -> None:
        if self.conversation_id is None:
            await self.send("error", code="no_session", message="Send session.start first")
            return
        if len(audio) > MAX_UTTERANCE_BYTES:
            await self.send("error", code="too_long", message="Utterance is too long")
            return
        await self._cancel_turn()  # a new utterance implies barge-in
        self._turn = asyncio.create_task(self._turn_task(audio))

    async def _turn_task(self, audio: bytes) -> None:
        received = time.perf_counter()
        marks: dict[str, int] = {}

        def mark(stage: str) -> None:
            marks.setdefault(stage, round((time.perf_counter() - received) * 1000))

        try:
            async with SessionFactory() as db:
                context = await self.voice.recent_context(db, self.session_id, self.conversation_id)
            mark("context")
            text, lang = await self.voice.transcribe(audio, context=context)
            mark("stt")
            if not text.strip():
                await self.send("turn.empty")
                return
            ctx = await self._save_user_turn(text)
            mark("user_saved")
            await self.send("user.transcript", text=text, lang=lang, message_id=str(ctx.user_message_id))
            await self._answer(ctx, received, mark)
            mark("done")
            logger.info("Live talk turn timing (ms since utterance received)", extra={"timing": marks})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Live talk turn failed")
            await self.send("error", code="turn_failed", message="Something went wrong. Please try again.")

    async def _save_user_turn(self, text: str) -> TurnContext:
        assert self.conversation_id is not None
        async with SessionFactory() as db:
            repo = ChatRepository(db)
            first = await repo.count_messages(self.conversation_id) == 0
            ctx = await self.chat.start_turn(
                db, self.session_id, message=text, conversation_id=self.conversation_id, modality="voice"
            )
            if first:
                await repo.touch_conversation(self.conversation_id, title=text)
                await db.commit()
        return ctx

    async def _answer(self, ctx: TurnContext, received: float, mark: Callable[[str], None]) -> None:
        """Route the turn, speak right away, and (if needed) follow with the grounded answer.

        Retrieval starts in parallel with routing, so the acknowledgement never delays the answer.
        """
        history = await self.chat.load_history(ctx)
        mark("history")
        retrieval_task = asyncio.create_task(self.chat.retrieve(ctx, history))
        retrieval_task.add_done_callback(lambda _: mark("retrieval"))
        settings = self.c.settings
        splitter = SentenceSplitter(first_clause_words=settings.tts_first_clause_words)
        answer_pieces = 0
        audio_queue: asyncio.Queue[asyncio.Task | None] = asyncio.Queue()
        audio_parts: list[bytes] = []
        first_audio_ms: list[int] = []
        no_answer = False

        async def synthesize(text: str, pause_ms: int) -> bytes:
            return prepend_silence(await self.c.tts.synthesize(text, ctx.lang), pause_ms)

        def speak(sentence: str, pause_ms: int = 0) -> None:
            audio_queue.put_nowait(asyncio.create_task(synthesize(sentence, pause_ms)))

        def speak_answer(piece: str) -> None:
            """Answer pieces: a short pause follows an early clause cut so the seam sounds natural."""
            nonlocal answer_pieces
            pause = settings.tts_clause_pause_ms if answer_pieces == 1 and splitter.first_was_clause else 0
            speak(piece, pause)
            answer_pieces += 1

        async def audio_sender() -> None:
            index = 0
            while (task := await audio_queue.get()) is not None:
                try:
                    audio = await task
                except Exception:
                    logger.exception("TTS failed for a sentence; skipping it")
                    continue
                if not first_audio_ms:
                    first_audio_ms.append(round((time.perf_counter() - received) * 1000))
                mark(f"audio_{index}")
                audio_parts.append(audio)
                await self.send_audio(index, audio)
                index += 1

        sender = asyncio.create_task(audio_sender())
        try:
            decision = await self.chat.router.decide(ctx.question, history, ctx.lang, mode="voice")
            mark("route")
            logger.info(
                "Live talk route: %s", decision.route, extra={"conversation_id": str(ctx.conversation_id)}
            )

            if decision.route == "direct":
                retrieval_task.cancel()
                await self.send("agent.text.delta", text=decision.say)
                speak(decision.say)
                await self.chat.save_direct_reply(
                    ctx, decision.say, round((time.perf_counter() - received) * 1000)
                )
            else:
                if decision.say:
                    # Spoken (and shown live) while the search runs; not saved as part of the answer.
                    await self.send("agent.text.delta", text=decision.say + " ")
                    speak(decision.say)
                async for event, data in self.chat.run_turn(
                    ctx, voice=True, history=history, retrieval_task=retrieval_task, started=received
                ):
                    if event == "sources":
                        await self.send("agent.sources", **data)
                    elif event == "delta":
                        mark("answer_first_token")
                        await self.send("agent.text.delta", text=data["text"])
                        for piece in splitter.feed(data["text"]):
                            speak_answer(piece)
                    elif event == "error":
                        await self.send("error", **data)
                    elif event == "done":
                        no_answer = data["no_answer"]
                for piece in splitter.flush():
                    speak_answer(piece)
            audio_queue.put_nowait(None)
            await sender
        except asyncio.CancelledError:
            retrieval_task.cancel()
            sender.cancel()
            while not audio_queue.empty():
                pending = audio_queue.get_nowait()
                if pending is not None:
                    pending.cancel()
            raise

        await self._finish_turn(ctx, join_wav(audio_parts), first_audio_ms[0] if first_audio_ms else None)
        await self.send(
            "turn.done",
            agent_message_id=str(ctx.assistant_message_id),
            interrupted=False,
            no_answer=no_answer,
        )

    async def _finish_turn(self, ctx: TurnContext, audio: bytes, first_audio_ms: int | None) -> None:
        """Store the turn's speech in MinIO and record end-of-speech → first-audio latency."""
        try:
            async with SessionFactory() as db:
                repo = ChatRepository(db)
                if audio:
                    await self.voice.store_audio(db, ctx.assistant_message_id, audio)
                message = await repo.get_message(ctx.assistant_message_id)
                if message is not None and first_audio_ms is not None:
                    message.first_token_ms = first_audio_ms
                await db.commit()
        except Exception:
            logger.exception("Failed to store live-talk audio")

    async def _drop_empty_conversation(self) -> None:
        if self.conversation_id is None:
            return
        try:
            async with SessionFactory() as db:
                repo = ChatRepository(db)
                if await repo.count_messages(self.conversation_id) == 0:
                    conversation = await repo.get_conversation(self.conversation_id, self.session_id)
                    if conversation is not None and conversation.title == PLACEHOLDER_TITLE:
                        await repo.delete_conversation(conversation)
                        await db.commit()
        except Exception:
            logger.exception("Failed to clean up empty voice conversation")
