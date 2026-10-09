"""Composition root: wires adapters into ports from configuration (design doc §5.1).

Swapping a vendor means changing this file (or AI_PROVIDER), never a service.
"""

from dataclasses import dataclass, field

from app.core.config import Settings
from app.domain.ports import (
    BlobStorePort,
    EmbedderPort,
    LLMPort,
    RerankerPort,
    STTPort,
    TTSPort,
    VectorStorePort,
)
from app.rag.hyde import HydeGenerator
from app.rag.ingestion.chunker import StructureChunker
from app.rag.ingestion.contextualizer import Contextualizer
from app.rag.ingestion.converters import ConverterRegistry
from app.rag.ingestion.converters.docx import DocxConverter
from app.rag.ingestion.converters.pdf_vision import PdfVisionConverter
from app.rag.ingestion.converters.text import TextConverter
from app.rag.ingestion.indexer import DocumentIndexer
from app.rag.pipeline import RetrievalPipeline
from app.rag.transcription import VocabularyTerm


@dataclass
class Container:
    settings: Settings
    llm: LLMPort
    embedder: EmbedderPort
    reranker: RerankerPort
    stt: STTPort
    tts: TTSPort
    vector_store: VectorStorePort
    blob_store: BlobStorePort
    retrieval: RetrievalPipeline
    indexer: DocumentIndexer
    _closers: list = field(default_factory=list)

    async def aclose(self) -> None:
        for close in self._closers:
            result = close()
            if hasattr(result, "__await__"):
                await result


def _ai_adapters(settings: Settings) -> tuple[LLMPort, EmbedderPort, RerankerPort, STTPort, TTSPort, list]:
    if settings.ai_provider == "fake":
        from app.adapters.fake.adapters import FakeEmbedder, FakeLLM, FakeReranker, FakeSTT, FakeTTS

        return FakeLLM(), FakeEmbedder(), FakeReranker(), FakeSTT(), FakeTTS(), []

    from app.adapters.openrouter.client import OpenRouterClient
    from app.adapters.openrouter.embeddings import OpenRouterEmbedder
    from app.adapters.openrouter.llm import OpenRouterLLM
    from app.adapters.openrouter.reranker import OpenRouterReranker
    from app.adapters.openrouter.speech import GeminiChatSTT, OpenRouterTTS

    client = OpenRouterClient(settings)
    llm = OpenRouterLLM(client, settings.llm_model)
    return (
        llm,
        OpenRouterEmbedder(client, settings.embedding_model, settings.embedding_batch_size),
        OpenRouterReranker(client, settings.rerank_model),
        GeminiChatSTT(
            llm,
            prompt_lang=settings.stt_prompt_lang,
            vocabulary=[VocabularyTerm.parse(v) for v in settings.stt_vocabulary if v.strip()],
        ),
        OpenRouterTTS(client, settings.tts_model, settings.tts_voice),
        [client.aclose],
    )


def build_container(
    settings: Settings,
    *,
    vector_store: VectorStorePort | None = None,
    blob_store: BlobStorePort | None = None,
) -> Container:
    from app.adapters.minio.blob_store import MinioBlobStore
    from app.adapters.weaviate.vector_store import WeaviateVectorStore

    llm, embedder, reranker, stt, tts, closers = _ai_adapters(settings)
    vector_store = vector_store or WeaviateVectorStore(settings)
    blob_store = blob_store or MinioBlobStore(settings)
    vector_store.ensure_schema("fake" if settings.ai_provider == "fake" else settings.embedding_model)
    blob_store.ensure_bucket()

    converters = ConverterRegistry(
        {
            ".pdf": PdfVisionConverter(llm, settings.pdf_pages_per_batch),
            ".docx": DocxConverter(),
            ".txt": TextConverter(),
            ".md": TextConverter(),
        }
    )
    indexer = DocumentIndexer(
        converters=converters,
        chunker=StructureChunker(settings.chunk_min_tokens, settings.chunk_max_tokens),
        contextualizer=Contextualizer(llm, settings.contextual_concurrency)
        if settings.contextual_retrieval
        else None,
        embedder=embedder,
        vector_store=vector_store,
    )
    retrieval = RetrievalPipeline(settings, HydeGenerator(llm), embedder, vector_store, reranker)
    return Container(
        settings=settings,
        llm=llm,
        embedder=embedder,
        reranker=reranker,
        stt=stt,
        tts=tts,
        vector_store=vector_store,
        blob_store=blob_store,
        retrieval=retrieval,
        indexer=indexer,
        _closers=[*closers, vector_store.close],
    )
