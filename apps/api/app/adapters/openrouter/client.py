import logging
from typing import Any

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


class AIProviderError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class OpenRouterClient:
    """Thin shared HTTP client for every OpenRouter endpoint (chat, embeddings, rerank, audio)."""

    def __init__(self, settings: Settings):
        if not settings.openrouter_api_key:
            logger.warning("OPENROUTER_API_KEY is empty: AI calls will fail until it is set in .env")
        self._http = httpx.AsyncClient(
            base_url=settings.openrouter_base_url,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "HTTP-Referer": settings.app_url,
                "X-Title": "Inkomoko Assistant",
            },
            timeout=httpx.Timeout(120.0, connect=10.0),
        )

    @property
    def http(self) -> httpx.AsyncClient:
        return self._http

    async def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._http.post(path, json=payload)
        self.raise_for_status(response)
        data = response.json()
        if isinstance(data, dict) and data.get("error"):
            raise AIProviderError(str(data["error"].get("message", data["error"])), response.status_code)
        return data

    async def post_bytes(self, path: str, payload: dict[str, Any]) -> bytes:
        response = await self._http.post(path, json=payload)
        self.raise_for_status(response)
        return response.content

    @staticmethod
    def raise_for_status(response: httpx.Response) -> None:
        if response.is_success:
            return
        try:
            detail = response.json().get("error", {}).get("message") or response.text
        except Exception:
            detail = response.text
        raise AIProviderError(f"OpenRouter {response.status_code}: {detail[:500]}", response.status_code)

    async def aclose(self) -> None:
        await self._http.aclose()
