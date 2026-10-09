import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import device_type_from, get_container, limiter, session_id_from
from app.core.config import get_settings
from app.core.container import Container
from app.core.db import get_db
from app.repositories.chat_repo import ChatRepository
from app.schemas.chat import ChatRequest, ConversationOut, ConversationSummaryOut, FeedbackIn, MessageOut
from app.services.chat_service import ChatService, NotFoundError

router = APIRouter(tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/chat", response_class=StreamingResponse)
@limiter.limit(get_settings().rate_limit_chat)
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    container: Container = Depends(get_container),
) -> StreamingResponse:
    service = ChatService(container)
    try:
        ctx = await service.start_turn(
            db,
            session_id_from(request),
            message=body.message,
            conversation_id=body.conversation_id,
            modality=body.modality,
            regenerate=body.regenerate,
            device_type=device_type_from(request),
        )
    except NotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    async def events() -> AsyncIterator[str]:
        yield _sse(
            "start",
            {
                "conversation_id": str(ctx.conversation_id),
                "user_message_id": str(ctx.user_message_id),
                "assistant_message_id": str(ctx.assistant_message_id),
                "lang": ctx.lang,
            },
        )
        async for event, data in service.run_text_turn(ctx):
            yield _sse(event, data)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/conversations", response_model=list[ConversationSummaryOut])
async def list_conversations(request: Request, db: AsyncSession = Depends(get_db)):
    conversations = await ChatRepository(db).list_conversations(session_id_from(request))
    return [ConversationSummaryOut.from_orm_conversation(c) for c in conversations]


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    repo = ChatRepository(db)
    conversation = await repo.get_conversation(conversation_id, session_id_from(request))
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    messages = await repo.list_messages(conversation.id)
    summary = ConversationSummaryOut.from_orm_conversation(conversation)
    return ConversationOut(
        **summary.model_dump(), messages=[MessageOut.from_orm_message(m) for m in messages]
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)
):
    repo = ChatRepository(db)
    conversation = await repo.get_conversation(conversation_id, session_id_from(request))
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    await repo.delete_conversation(conversation)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/messages/{message_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def feedback(
    message_id: uuid.UUID, body: FeedbackIn, request: Request, db: AsyncSession = Depends(get_db)
):
    repo = ChatRepository(db)
    message = await repo.get_session_message(message_id, session_id_from(request))
    if message is None or message.role != "assistant":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    await repo.upsert_feedback(message.id, body.rating, body.comment)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
