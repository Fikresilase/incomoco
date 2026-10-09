"""Retrieval pipeline: language → HyDE → embed → Weaviate hybrid → rerank (design doc §6.1).

Generation is a separate step (rag/generation) so text chat and live talk share retrieval.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from app.core.config import Settings
from app.domain.models import ChatTurn, RetrievalResult
from app.domain.ports import EmbedderPort, RerankerPort, VectorStorePort
from app.rag.hyde import HydeGenerator
from app.rag.ingestion.normalizer import normalize_for_search
from app.rag.language import detect_lang

logger = logging.getLogger(__name__)

ReadyDocumentIds = Callable[[], Awaitable[list[str]]]


class RetrievalPipeline:
    def __init__(
        self,
        settings: Settings,
        hyde: HydeGenerator,
        embedder: EmbedderPort,
        vector_store: VectorStorePort,
        reranker: RerankerPort,
    ):
        self._settings = settings
        self._hyde = hyde
        self._embedder = embedder
        self._vector_store = vector_store
        self._reranker = reranker

    async def retrieve(
        self, query: str, history: list[ChatTurn], ready_document_ids: ReadyDocumentIds
    ) -> RetrievalResult:
        s = self._settings
        timings: dict[str, int] = {}
        clock = time.perf_counter()

        def lap(stage: str) -> None:
            nonlocal clock
            now = time.perf_counter()
            timings[stage] = round((now - clock) * 1000)
            clock = now

        lang = detect_lang(query)
        document_ids = await ready_document_ids()
        if not document_ids:
            return RetrievalResult(
                query=query, lang=lang, hyde_text="", candidates=[], reranked=[], stage_latency_ms={}
            )

        try:
            hyde_text = await self._hyde.generate(query, history)
        except Exception:  # degrade to embedding the raw question
            logger.exception("HyDE failed; falling back to the raw query")
            hyde_text = ""
        lap("hyde")

        vector = (await self._embedder.embed([hyde_text or query]))[0]
        lap("embed")

        candidates = await asyncio.to_thread(
            self._vector_store.hybrid_search,
            normalize_for_search(query),
            vector,
            alpha=s.hybrid_alpha,
            limit=s.retrieval_top_k,
            document_ids=document_ids,
        )
        lap("search")

        reranked = []
        if candidates:
            results = await self._reranker.rerank(
                query, [f"{c.breadcrumb}\n{c.text}" for c in candidates], top_n=s.rerank_top_n
            )
            for result in results:
                if result.score >= s.rerank_min_score:
                    chunk = candidates[result.index]
                    chunk.rerank_score = result.score
                    reranked.append(chunk)
        lap("rerank")

        return RetrievalResult(
            query=query,
            lang=lang,
            hyde_text=hyde_text,
            candidates=candidates,
            reranked=reranked,
            stage_latency_ms=timings,
        )
