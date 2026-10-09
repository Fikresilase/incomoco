"""Ports: the interfaces services depend on. Adapters implement them (design doc §5.1)."""

from collections.abc import AsyncIterator, Sequence
from typing import Any, Protocol

from app.domain.models import ChatTurn, ChunkRecord, LLMUsage, RerankResult, RetrievedChunk


class LLMPort(Protocol):
    model: str

    async def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str: ...

    def stream(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        usage: LLMUsage | None = None,
    ) -> AsyncIterator[str]: ...


class EmbedderPort(Protocol):
    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class RerankerPort(Protocol):
    async def rerank(self, query: str, documents: Sequence[str], top_n: int) -> list[RerankResult]: ...


class STTPort(Protocol):
    async def transcribe(
        self, audio: bytes, audio_format: str = "wav", context: list[ChatTurn] | None = None
    ) -> str: ...


class TTSPort(Protocol):
    model: str
    voice: str
    audio_format: str  # e.g. "wav"
    content_type: str  # e.g. "audio/wav"

    async def synthesize(self, text: str, lang: str) -> bytes: ...


class VectorStorePort(Protocol):
    def ensure_schema(self, embedding_model: str) -> None: ...

    def insert_chunks(self, chunks: Sequence[ChunkRecord], vectors: Sequence[Sequence[float]]) -> None: ...

    def delete_document(self, document_id: str) -> int: ...

    def hybrid_search(
        self,
        query_text: str,
        vector: Sequence[float],
        *,
        alpha: float,
        limit: int,
        document_ids: Sequence[str],
    ) -> list[RetrievedChunk]: ...

    def close(self) -> None: ...


class BlobStorePort(Protocol):
    def ensure_bucket(self) -> None: ...

    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...
