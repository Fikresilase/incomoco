"""Data access for sessions, conversations, messages, citations, feedback, traces, and TTS audio."""

import uuid
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ChatTurn, RetrievalResult, Source
from app.repositories.orm import (
    ChatSession,
    Conversation,
    Message,
    MessageAudio,
    MessageFeedback,
    MessageSource,
    RetrievalTrace,
    utcnow,
)


class ChatRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ---- sessions ---------------------------------------------------------------

    async def touch_session(self, session_id: uuid.UUID, device_type: str | None) -> None:
        stmt = insert(ChatSession).values(id=session_id, device_type=device_type)
        stmt = stmt.on_conflict_do_update(index_elements=[ChatSession.id], set_={"last_seen_at": utcnow()})
        await self.db.execute(stmt)

    # ---- conversations ----------------------------------------------------------

    async def create_conversation(self, session_id: uuid.UUID, title: str) -> Conversation:
        conversation = Conversation(session_id=session_id, title=title[:80])
        self.db.add(conversation)
        await self.db.flush()
        return conversation

    async def get_conversation(
        self, conversation_id: uuid.UUID, session_id: uuid.UUID
    ) -> Conversation | None:
        result = await self.db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.session_id == session_id
            )
        )
        return result.scalar_one_or_none()

    async def list_conversations(self, session_id: uuid.UUID) -> list[Conversation]:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.session_id == session_id)
            .order_by(Conversation.updated_at.desc())
            .limit(200)
        )
        return list(result.scalars())

    async def delete_conversation(self, conversation: Conversation) -> None:
        await self.db.delete(conversation)

    async def touch_conversation(self, conversation_id: uuid.UUID, title: str | None = None) -> None:
        values: dict = {"updated_at": utcnow()}
        if title:
            values["title"] = title[:80]
        await self.db.execute(update(Conversation).where(Conversation.id == conversation_id).values(**values))

    async def count_messages(self, conversation_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Message).where(Message.conversation_id == conversation_id)
        )
        return result.scalar_one()

    # ---- messages ---------------------------------------------------------------

    async def list_messages(self, conversation_id: uuid.UUID) -> list[Message]:
        result = await self.db.execute(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
        )
        return list(result.scalars())

    async def history(
        self, conversation_id: uuid.UUID, turns: int, before: datetime | None = None
    ) -> list[ChatTurn]:
        query = select(Message).where(Message.conversation_id == conversation_id, Message.content != "")
        if before is not None:
            query = query.where(Message.created_at < before)
        result = await self.db.execute(query.order_by(Message.created_at.desc()).limit(turns))
        return [ChatTurn(role=m.role, content=m.content) for m in reversed(list(result.scalars()))]

    async def add_user_message(
        self, conversation_id: uuid.UUID, content: str, lang: str, modality: str
    ) -> Message:
        message = Message(
            conversation_id=conversation_id, role="user", content=content, lang=lang, modality=modality
        )
        self.db.add(message)
        await self.db.flush()
        return message

    async def get_message(self, message_id: uuid.UUID) -> Message | None:
        return await self.db.get(Message, message_id)

    async def get_session_message(self, message_id: uuid.UUID, session_id: uuid.UUID) -> Message | None:
        result = await self.db.execute(
            select(Message)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(Message.id == message_id, Conversation.session_id == session_id)
        )
        return result.scalar_one_or_none()

    async def last_messages(self, conversation_id: uuid.UUID, limit: int = 2) -> list[Message]:
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars())

    async def delete_message(self, message: Message) -> None:
        await self.db.delete(message)

    async def save_assistant_turn(
        self,
        *,
        message_id: uuid.UUID,
        conversation_id: uuid.UUID,
        content: str,
        lang: str,
        modality: str,
        status: str,
        no_answer: bool,
        first_token_ms: int | None,
        latency_ms: int,
        tokens_in: int | None,
        tokens_out: int | None,
        model: str,
        sources: list[Source],
        retrieval: RetrievalResult | None,
    ) -> None:
        self.db.add(
            Message(
                id=message_id,
                conversation_id=conversation_id,
                role="assistant",
                content=content,
                lang=lang,
                modality=modality,
                status=status,
                no_answer=no_answer,
                first_token_ms=first_token_ms,
                latency_ms=latency_ms,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                model=model,
            )
        )
        await self.db.flush()
        for source in sources:
            self.db.add(
                MessageSource(
                    message_id=message_id,
                    rank=source.index,
                    document_id=uuid.UUID(source.document_id),
                    chunk_id=uuid.UUID(source.chunk_id),
                    title=source.title,
                    breadcrumb=source.breadcrumb,
                    page_start=source.page_start,
                    page_end=source.page_end,
                    snippet=source.snippet,
                    rerank_score=source.score,
                )
            )
        if retrieval is not None:
            self.db.add(
                RetrievalTrace(
                    message_id=message_id,
                    query=retrieval.query,
                    hyde_text=retrieval.hyde_text,
                    candidates=[
                        {
                            "chunk_id": c.id,
                            "document_id": c.document_id,
                            "hybrid_score": round(c.hybrid_score, 4),
                        }
                        for c in retrieval.candidates
                    ],
                    reranked=[
                        {"chunk_id": c.id, "rerank_score": round(c.rerank_score, 4)}
                        for c in retrieval.reranked
                    ],
                    top_rerank_score=retrieval.top_score,
                    stage_latency_ms=retrieval.stage_latency_ms,
                )
            )

    # ---- feedback & audio -------------------------------------------------------

    async def upsert_feedback(self, message_id: uuid.UUID, rating: int, comment: str | None) -> None:
        stmt = insert(MessageFeedback).values(message_id=message_id, rating=rating, comment=comment)
        stmt = stmt.on_conflict_do_update(
            index_elements=[MessageFeedback.message_id],
            set_={"rating": rating, "comment": comment, "updated_at": utcnow()},
        )
        await self.db.execute(stmt)

    async def save_audio(
        self,
        message_id: uuid.UUID,
        storage_key: str,
        audio_format: str,
        voice: str,
        model: str,
        duration_ms: int | None = None,
    ) -> None:
        await self.db.execute(delete(MessageAudio).where(MessageAudio.message_id == message_id))
        self.db.add(
            MessageAudio(
                message_id=message_id,
                storage_key=storage_key,
                format=audio_format,
                voice=voice,
                model=model,
                duration_ms=duration_ms,
            )
        )
