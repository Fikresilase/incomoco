from collections.abc import Sequence

from app.adapters.openrouter.client import OpenRouterClient
from app.domain.models import RerankResult


class OpenRouterReranker:
    """RerankerPort over OpenRouter /rerank (Cohere Rerank 4 Fast)."""

    def __init__(self, client: OpenRouterClient, model: str):
        self._client = client
        self._model = model

    async def rerank(self, query: str, documents: Sequence[str], top_n: int) -> list[RerankResult]:
        if not documents:
            return []
        data = await self._client.post_json(
            "/rerank",
            {"model": self._model, "query": query, "documents": list(documents), "top_n": top_n},
        )
        return [RerankResult(index=r["index"], score=float(r["relevance_score"])) for r in data["results"]]
