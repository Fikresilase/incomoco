from collections.abc import Sequence

from app.adapters.openrouter.client import OpenRouterClient


class OpenRouterEmbedder:
    """EmbedderPort over OpenRouter /embeddings (Gemini Embedding 2)."""

    def __init__(self, client: OpenRouterClient, model: str, batch_size: int = 32):
        self._client = client
        self._model = model
        self._batch_size = batch_size

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = list(texts[start : start + self._batch_size])
            data = await self._client.post_json("/embeddings", {"model": self._model, "input": batch})
            items = sorted(data["data"], key=lambda item: item["index"])
            vectors.extend(item["embedding"] for item in items)
        return vectors
