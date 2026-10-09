import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.deps import limiter, parse_session_cookie
from app.api.v1 import admin_auth, analytics, chat, documents, voice
from app.core.config import get_settings
from app.core.container import build_container
from app.core.logging import setup_logging
from app.core.security import SESSION_COOKIE

SESSION_MAX_AGE = 60 * 60 * 24 * 365


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    app.state.container = await asyncio.to_thread(build_container, get_settings())
    yield
    await app.state.container.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Inkomoko Assistant API", version="0.1.0", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.middleware("http")
    async def anonymous_session(request: Request, call_next):
        """Every browser gets a random session ID cookie (anonymous users, design doc §2)."""
        session_id = parse_session_cookie(request.cookies.get(SESSION_COOKIE))
        is_new = session_id is None
        request.state.session_id = session_id or uuid.uuid4()
        response = await call_next(request)
        if is_new:
            response.set_cookie(
                SESSION_COOKIE,
                str(request.state.session_id),
                max_age=SESSION_MAX_AGE,
                httponly=True,
                samesite="lax",
                secure=settings.cookie_secure,
            )
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (chat.router, voice.router, admin_auth.router, documents.router, analytics.router):
        app.include_router(router, prefix="/api/v1")

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
