"""Ingestion pipeline: convert → chunk → contextualize → embed → index (design doc §6.2)."""

import asyncio
import logging
import uuid
from dataclasses import dataclass

from app.domain.models import ChunkRecord
from app.domain.ports import EmbedderPort, VectorStorePort
from app.rag.ingestion.chunker import StructureChunker
from app.rag.ingestion.contextualizer import Contextualizer
from app.rag.ingestion.converters import ConverterRegistry
from app.rag.ingestion.normalizer import normalize_for_search
from app.rag.language import detect_document_lang

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class IndexResult:
    chunk_count: int
    page_count: int | None
    lang: str


class DocumentIndexer:
    def __init__(
        self,
        converters: ConverterRegistry,
        chunker: StructureChunker,
        contextualizer: Contextualizer | None,
        embedder: EmbedderPort,
        vector_store: VectorStorePort,
    ):
        self._converters = converters
        self._chunker = chunker
        self._contextualizer = contextualizer
        self._embedder = embedder
        self._vector_store = vector_store

    async def index(self, *, document_id: str, title: str, filename: str, data: bytes) -> IndexResult:
        converted = await self._converters.convert(data, filename)
        markdown = converted.markdown.strip()
        if not markdown:
            raise ValueError("No text could be extracted from this document")

        chunks = self._chunker.chunk(markdown, title)
        lang = detect_document_lang(markdown)
        contexts = (
            await self._contextualizer.contextualize(markdown, [c.text for c in chunks])
            if self._contextualizer
            else [""] * len(chunks)
        )

        records = []
        for chunk, context in zip(chunks, contexts, strict=True):
            header = "\n".join(p for p in (context, chunk.breadcrumb) if p)
            records.append(
                ChunkRecord(
                    # Deterministic IDs make re-ingestion of the same document idempotent.
                    id=str(uuid.uuid5(uuid.UUID(document_id), str(chunk.index))),
                    document_id=document_id,
                    chunk_index=chunk.index,
                    title=title,
                    breadcrumb=chunk.breadcrumb,
                    text=chunk.text,
                    context=context,
                    search_text=normalize_for_search(f"{header}\n{chunk.text}"),
                    lang=detect_document_lang(chunk.text),
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                )
            )

        # Dense side embeds the original (un-normalized) text with its context and breadcrumb.
        vectors = await self._embedder.embed(
            ["\n".join(p for p in (r.context, r.breadcrumb, r.text) if p) for r in records]
        )
        await asyncio.to_thread(self._vector_store.delete_document, document_id)
        await asyncio.to_thread(self._vector_store.insert_chunks, records, vectors)
        logger.info("Indexed %s chunks", len(records), extra={"document_id": document_id})
        return IndexResult(chunk_count=len(records), page_count=converted.page_count, lang=lang)
