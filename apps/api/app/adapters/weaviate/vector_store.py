import logging
import time
from collections.abc import Sequence

import weaviate
from weaviate.classes.config import Configure, DataType, Property, Tokenization
from weaviate.classes.data import DataObject
from weaviate.classes.query import Filter, HybridFusion, MetadataQuery

from app.core.config import Settings
from app.domain.models import ChunkRecord, RetrievedChunk

logger = logging.getLogger(__name__)


def _prop(name: str, data_type: DataType, *, searchable: bool = False, filterable: bool = False) -> Property:
    if searchable:
        tokenization = Tokenization.WORD  # Unicode-aware: handles Ethiopic script and lowercases
    elif filterable:
        tokenization = Tokenization.FIELD  # exact match: IDs must never be split or stopword-filtered
    else:
        tokenization = None
    return Property(
        name=name,
        data_type=data_type,
        index_searchable=searchable,
        index_filterable=filterable,
        tokenization=tokenization,
    )


class WeaviateVectorStore:
    """VectorStorePort over Weaviate. We bring our own vectors (vectorizer: none)."""

    def __init__(self, settings: Settings, connect_retries: int = 30):
        self._name = settings.weaviate_collection
        last_error: Exception | None = None
        for _ in range(connect_retries):
            try:
                self._client = weaviate.connect_to_custom(
                    http_host=settings.weaviate_host,
                    http_port=settings.weaviate_http_port,
                    http_secure=False,
                    grpc_host=settings.weaviate_host,
                    grpc_port=settings.weaviate_grpc_port,
                    grpc_secure=False,
                )
                break
            except Exception as exc:  # Weaviate may still be starting
                last_error = exc
                time.sleep(2)
        else:
            raise RuntimeError(f"Could not connect to Weaviate: {last_error}")

    def ensure_schema(self, embedding_model: str) -> None:
        """Create the collection, or verify it was built with the same embedding model.

        Vectors from different embedding models (or dimensions) cannot be searched together,
        so a mismatch fails loudly at startup instead of breaking every query later.
        """
        marker = f"embedding_model={embedding_model}"
        if self._client.collections.exists(self._name):
            existing = self._client.collections.get(self._name).config.get().description or ""
            if existing and existing != marker:
                raise RuntimeError(
                    f"Weaviate collection '{self._name}' was indexed with {existing!r}, but the app is "
                    f"configured for {marker!r}. Vectors from different embedding models can't be mixed. "
                    f"Delete the collection (DELETE /v1/schema/{self._name}) and re-upload the documents, "
                    "or switch EMBEDDING_MODEL / AI_PROVIDER back."
                )
            return
        self._client.collections.create(
            self._name,
            description=marker,
            vector_config=Configure.Vectors.self_provided(),
            properties=[
                _prop("document_id", DataType.TEXT, filterable=True),
                Property(name="chunk_index", data_type=DataType.INT),
                _prop("title", DataType.TEXT),
                _prop("breadcrumb", DataType.TEXT),
                _prop("text", DataType.TEXT),
                _prop("context", DataType.TEXT),
                _prop("search_text", DataType.TEXT, searchable=True),
                _prop("lang", DataType.TEXT, filterable=True),
                Property(name="page_start", data_type=DataType.INT),
                Property(name="page_end", data_type=DataType.INT),
            ],
        )
        logger.info("Created Weaviate collection %s", self._name)

    @property
    def _collection(self):
        return self._client.collections.get(self._name)

    def insert_chunks(self, chunks: Sequence[ChunkRecord], vectors: Sequence[Sequence[float]]) -> None:
        objects = [
            DataObject(
                uuid=chunk.id,
                vector=list(vector),
                properties={
                    "document_id": chunk.document_id,
                    "chunk_index": chunk.chunk_index,
                    "title": chunk.title,
                    "breadcrumb": chunk.breadcrumb,
                    "text": chunk.text,
                    "context": chunk.context,
                    "search_text": chunk.search_text,
                    "lang": chunk.lang,
                    "page_start": chunk.page_start,
                    "page_end": chunk.page_end,
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        result = self._collection.data.insert_many(objects)
        if result.has_errors:
            first = next(iter(result.errors.values()))
            raise RuntimeError(f"Weaviate insert failed for {len(result.errors)} chunks: {first.message}")

    def delete_document(self, document_id: str) -> int:
        result = self._collection.data.delete_many(where=Filter.by_property("document_id").equal(document_id))
        return result.successful

    def hybrid_search(
        self,
        query_text: str,
        vector: Sequence[float],
        *,
        alpha: float,
        limit: int,
        document_ids: Sequence[str],
    ) -> list[RetrievedChunk]:
        if not document_ids:
            return []
        response = self._collection.query.hybrid(
            query=query_text,
            vector=list(vector),
            alpha=alpha,
            limit=limit,
            query_properties=["search_text"],
            fusion_type=HybridFusion.RELATIVE_SCORE,
            filters=Filter.by_property("document_id").contains_any(list(document_ids)),
            return_metadata=MetadataQuery(score=True),
            return_properties=["document_id", "title", "breadcrumb", "text", "page_start", "page_end"],
        )
        return [
            RetrievedChunk(
                id=str(obj.uuid),
                document_id=obj.properties["document_id"],
                title=obj.properties.get("title") or "",
                breadcrumb=obj.properties.get("breadcrumb") or "",
                text=obj.properties.get("text") or "",
                page_start=obj.properties.get("page_start"),
                page_end=obj.properties.get("page_end"),
                hybrid_score=float(obj.metadata.score or 0.0),
            )
            for obj in response.objects
        ]

    def drop_collection(self) -> None:
        """Test helper: remove the whole collection."""
        if self._client.collections.exists(self._name):
            self._client.collections.delete(self._name)

    def close(self) -> None:
        self._client.close()
