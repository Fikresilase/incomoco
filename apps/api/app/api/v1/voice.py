import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    status,
)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SESSION_COOKIE, get_container, limiter, parse_session_cookie, session_id_from
from app.core.config import get_settings
from app.core.container import Container
from app.core.db import get_db
from app.services.chat_service import NotFoundError
from app.services.live_talk import LiveTalkSession
from app.services.voice_service import VoiceService

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_DICTATION_BYTES = 2 * 1024 * 1024  # ~60 s of 16 kHz mono PCM16 WAV


class TranscriptionOut(BaseModel):
    text: str
    lang: str


class SpeakIn(BaseModel):
    message_id: uuid.UUID


@router.post("/transcribe", response_model=TranscriptionOut)
@limiter.limit(get_settings().rate_limit_voice)
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    conversation_id: uuid.UUID | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    container: Container = Depends(get_container),
) -> TranscriptionOut:
    data = await audio.read(MAX_DICTATION_BYTES + 1)
    if len(data) > MAX_DICTATION_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Recording is longer than 60 seconds")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty recording")
    service = VoiceService(container)
    context = await service.recent_context(db, session_id_from(request), conversation_id)
    text, lang = await service.transcribe(data, "wav", context)
    return TranscriptionOut(text=text, lang=lang)


@router.post("/speak", response_class=Response, responses={200: {"content": {"audio/wav": {}}}})
@limiter.limit(get_settings().rate_limit_voice)
async def speak(
    request: Request,
    body: SpeakIn,
    db: AsyncSession = Depends(get_db),
    container: Container = Depends(get_container),
) -> Response:
    try:
        audio = await VoiceService(container).speak_message(db, session_id_from(request), body.message_id)
    except NotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return Response(
        content=audio,
        media_type=container.tts.content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.websocket("/live")
async def live(websocket: WebSocket) -> None:
    # CORS does not cover WebSockets: reject other sites so they can't ride the session cookie.
    origin = websocket.headers.get("origin")
    if origin and origin not in get_settings().cors_origins:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    # The browser has already received the session cookie from earlier HTTP calls.
    session_id = parse_session_cookie(websocket.cookies.get(SESSION_COOKIE)) or uuid.uuid4()
    await LiveTalkSession(websocket, websocket.app.state.container, session_id).run()
