"""Plain domain objects passed between services, the RAG pipeline, and adapters."""

from dataclasses import dataclass, field
from typing import Literal

Lang = Literal["am", "en"]


@dataclass(slots=True)
class ChatTurn:
    role: Literal["user", "assistant"]
    content: str


@dataclass(slots=True)
class ChunkRecord:
    """A chunk ready to be written to the vector store."""

    id: str
    document_id: str
    chunk_index: int
    title: str
    breadcrumb: str
    text: str
    context: str
    search_text: str
    lang: str
    page_start: int | None
    page_end: int | None


@dataclass(slots=True)
class RetrievedChunk:
    id: str
    document_id: str
    title: str
    breadcrumb: str
    text: str
    page_start: int | None
    page_end: int | None
    hybrid_score: float = 0.0
    rerank_score: float = 0.0


@dataclass(slots=True)
class RerankResult:
    index: int
    score: float


@dataclass(slots=True)
class LLMUsage:
    tokens_in: int | None = None
    tokens_out: int | None = None


@dataclass(slots=True)
class Source:
    index: int
    document_id: str
    chunk_id: str
    title: str
    breadcrumb: str
    page_start: int | None
    page_end: int | None
    snippet: str
    score: float

    def to_public(self) -> dict:
        return {
            "index": self.index,
            "document_id": self.document_id,
            "title": self.title,
            "breadcrumb": self.breadcrumb,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "snippet": self.snippet,
            "score": round(self.score, 4),
        }


@dataclass(slots=True)
class RetrievalResult:
    query: str
    lang: Lang
    hyde_text: str
    candidates: list[RetrievedChunk]
    reranked: list[RetrievedChunk]
    stage_latency_ms: dict[str, int] = field(default_factory=dict)

    @property
    def top_score(self) -> float | None:
        return max((c.rerank_score for c in self.reranked), default=None)
