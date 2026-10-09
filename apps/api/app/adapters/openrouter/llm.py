import json
from collections.abc import AsyncIterator
from typing import Any

from app.adapters.openrouter.client import AIProviderError, OpenRouterClient
from app.domain.models import LLMUsage


class OpenRouterLLM:
    """LLMPort over OpenRouter chat completions."""

    def __init__(self, client: OpenRouterClient, model: str):
        self._client = client
        self.model = model

    async def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str:
        payload: dict[str, Any] = {"model": self.model, "messages": messages, "temperature": temperature}
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if extra:
            payload.update(extra)
        data = await self._client.post_json("/chat/completions", payload)
        try:
            return (data["choices"][0]["message"].get("content") or "").strip()
        except (KeyError, IndexError) as exc:
            raise AIProviderError(f"Unexpected completion payload: {str(data)[:300]}") from exc

    async def stream(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        usage: LLMUsage | None = None,
    ) -> AsyncIterator[str]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
            "usage": {"include": True},
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        async with self._client.http.stream("POST", "/chat/completions", json=payload) as response:
            if not response.is_success:
                await response.aread()
                OpenRouterClient.raise_for_status(response)
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue  # blank lines and ": OPENROUTER PROCESSING" keep-alives
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                chunk = json.loads(data)
                if chunk.get("error"):
                    raise AIProviderError(str(chunk["error"].get("message", chunk["error"])))
                if usage is not None and chunk.get("usage"):
                    usage.tokens_in = chunk["usage"].get("prompt_tokens")
                    usage.tokens_out = chunk["usage"].get("completion_tokens")
                for choice in chunk.get("choices", []):
                    text = (choice.get("delta") or {}).get("content")
                    if text:
                        yield text
