"""Chat use cases: start a turn, then stream retrieval + grounded generation (design doc §6.1)."""

import asyncio
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator, Awaitable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import Container
from app.core.db import SessionFactory
from app.domain.models import ChatTurn, Lang, RetrievalResult, RetrievedChunk, Source
from app.rag.generation.answer import AnswerStream
from app.rag.language import detect_lang
from app.repositories.chat_repo import ChatRepository
from app.repositories.document_repo import DocumentRepository

logger = logging.getLogger(__name__)

TurnEvent = tuple[str, dict]


class NotFoundError(LookupError):
    pass


@dataclass(slots=True)
class TurnContext:
    conversation_id: uuid.UUID
    user_message_id: uuid.UUID
    assistant_message_id: uuid.UUID
    question: str
    lang: Lang
    modality: str
    user_created_at: datetime


def _snippet(text: str, limit: int = 300) -> str:
    plain = re.sub(r"[#*_`>|]", "", text)
    plain = re.sub(r"\s+", " ", plain).strip()
    return plain if len(plain) <= limit else plain[: limit - 1].rstrip() + "…"


def to_sources(chunks: list[RetrievedChunk]) -> list[Source]:
    return [
        Source(
            index=i,
            document_id=c.document_id,
            chunk_id=c.id,
            title=c.title,
            breadcrumb=c.breadcrumb,
            page_start=c.page_start,
            page_end=c.page_end,
            snippet=_snippet(c.text),
            score=c.rerank_score,
        )
        for i, c in enumerate(chunks, start=1)
    ]


class ChatService:
    def __init__(self, container: Container):
        self.c = container

    async def start_turn(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        *,
        message: str | None,
        conversation_id: uuid.UUID | None,
        modality: str,
        regenerate: bool = False,
        device_type: str | None = None,
    ) -> TurnContext:
        repo = ChatRepository(db)
        await repo.touch_session(session_id, device_type)

        if regenerate:
            if conversation_id is None:
                raise NotFoundError("conversation_id is required to regenerate")
            conversation = await repo.get_conversation(conversation_id, session_id)
            if conversation is None:
                raise NotFoundError("Conversation not found")
            user_message = None
            for m in await repo.last_messages(conversation.id, limit=4):
                if m.role == "assistant" and user_message is None:
                    await repo.delete_message(m)
                elif m.role == "user":
                    user_message = m
                    break
            if user_message is None:
                raise NotFoundError("Nothing to regenerate")
        else:
            text = (message or "").strip()
            if conversation_id is not None:
                conversation = await repo.get_conversation(conversation_id, session_id)
                if conversation is None:
                    raise NotFoundError("Conversation not found")
            else:
                conversation = await repo.create_conversation(session_id, text)
            user_message = await repo.add_user_message(conversation.id, text, detect_lang(text), modality)

        await repo.touch_conversation(conversation.id)
        await db.commit()
        return TurnContext(
            conversation_id=conversation.id,
            user_message_id=user_message.id,
            assistant_message_id=uuid.uuid4(),
            question=user_message.content,
            lang=user_message.lang,  # type: ignore[arg-type]
            modality=user_message.modality,
            user_created_at=user_message.created_at,
        )

    async def load_history(self, ctx: TurnContext) -> list[ChatTurn]:
        async with SessionFactory() as db:
            return await ChatRepository(db).history(
                ctx.conversation_id, self.c.settings.history_turns, before=ctx.user_created_at
            )

    async def retrieve(self, ctx: TurnContext, history: list[ChatTurn]) -> RetrievalResult:
        async with SessionFactory() as db:
            return await self.c.retrieval.retrieve(ctx.question, history, DocumentRepository(db).ready_ids)

    async def save_direct_reply(self, ctx: TurnContext, content: str, latency_ms: int) -> None:
        """Persist a reply that needed no document search (live-talk small talk)."""
        answer = AnswerStream(self.c.llm, self.c.settings.answer_temperature)
        await self._persist(ctx, content, "complete", answer, latency_ms, latency_ms, [], None)

    async def run_turn(
        self,
        ctx: TurnContext,
        *,
        voice: bool = False,
        history: list[ChatTurn] | None = None,
        retrieval_task: Awaitable[RetrievalResult] | None = None,
        started: float | None = None,
    ) -> AsyncIterator[TurnEvent]:
        """Retrieve, stream the grounded answer, and persist it. Persists partial answers on interrupt.

        Live talk may pass a `retrieval_task` it already started (in parallel with turn routing).
        """
        s = self.c.settings
        started = started or time.perf_counter()
        first_token_ms: int | None = None
        parts: list[str] = []
        sources: list[Source] = []
        retrieval: RetrievalResult | None = None
        answer = AnswerStream(self.c.llm, s.answer_temperature)
        status = "complete"

        try:
            if history is None:
                history = await self.load_history(ctx)
            retrieval = await (retrieval_task or self.retrieve(ctx, history))
            sources = to_sources(retrieval.reranked)
            yield "sources", {"sources": [x.to_public() for x in sources]}

            async for delta in answer.stream(
                ctx.question, history, retrieval.reranked, ctx.lang, voice=voice
            ):
                if first_token_ms is None:
                    first_token_ms = round((time.perf_counter() - started) * 1000)
                parts.append(delta)
                yield "delta", {"text": delta}
        except (asyncio.CancelledError, GeneratorExit):
            status = "interrupted"
            raise
        except Exception as exc:
            status = "error"
            logger.exception("Chat turn failed", extra={"conversation_id": str(ctx.conversation_id)})
            yield "error", {"code": "generation_failed", "message": _public_error(exc)}
        finally:
            latency_ms = round((time.perf_counter() - started) * 1000)
            if retrieval is not None:
                retrieval.stage_latency_ms["first_token"] = first_token_ms or latency_ms
                retrieval.stage_latency_ms["total"] = latency_ms
            content = "".join(parts).strip()
            if status != "error" or content:
                await asyncio.shield(
                    self._persist(
                        ctx, content, status, answer, first_token_ms, latency_ms, sources, retrieval
                    )
                )

        if status == "complete":
            yield (
                "done",
                {
                    "assistant_message_id": str(ctx.assistant_message_id),
                    "no_answer": answer.no_answer,
                    "latency_ms": latency_ms,
                },
            )

    async def _persist(
        self,
        ctx: TurnContext,
        content: str,
        status: str,
        answer: AnswerStream,
        first_token_ms: int | None,
        latency_ms: int,
        sources: list[Source],
        retrieval: RetrievalResult | None,
    ) -> None:
        try:
            async with SessionFactory() as db:
                repo = ChatRepository(db)
                await repo.save_assistant_turn(
                    message_id=ctx.assistant_message_id,
                    conversation_id=ctx.conversation_id,
                    content=content,
                    lang=ctx.lang,
                    modality=ctx.modality,
                    status=status,
                    no_answer=answer.no_answer,
                    first_token_ms=first_token_ms,
                    latency_ms=latency_ms,
                    tokens_in=answer.usage.tokens_in,
                    tokens_out=answer.usage.tokens_out,
                    model=self.c.llm.model,
                    sources=sources,
                    retrieval=retrieval,
                )
                await repo.touch_conversation(ctx.conversation_id)
                await db.commit()
        except Exception:
            logger.exception("Failed to persist assistant turn")


def _public_error(exc: Exception) -> str:
    from app.adapters.openrouter.client import AIProviderError

    if isinstance(exc, AIProviderError):
        if exc.status in (401, 403):
            return "The AI service rejected the request. Check OPENROUTER_API_KEY."
        if exc.status == 402:
            return "The AI service account is out of credits."
        if exc.status == 429:
            return "The AI service is busy. Please try again in a moment."
    return "Something went wrong while generating the answer. Please try again."
