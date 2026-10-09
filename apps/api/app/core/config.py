from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration. Model IDs and tuning live here, never in code."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Infrastructure
    database_url: str = "postgresql+asyncpg://inkomoko:inkomoko@localhost:5432/inkomoko"
    database_pool: bool = True  # tests disable pooling so connections never cross event loops
    weaviate_host: str = "localhost"
    weaviate_http_port: int = 8080
    weaviate_grpc_port: int = 50051
    weaviate_collection: str = "Chunk"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "inkomoko"
    minio_secret_key: str = "inkomoko-secret"
    minio_bucket: str = "documents"
    minio_secure: bool = False

    # AI gateway. ai_provider="fake" runs fully offline (tests, no API key).
    ai_provider: str = "openrouter"
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    app_url: str = "http://localhost:3000"
    llm_model: str = "google/gemini-3.5-flash-lite"
    tts_model: str = "google/gemini-3.8-flash-lite-tts"
    tts_voice: str = "Kore"
    embedding_model: str = "google/gemini-embedding-2"
    rerank_model: str = "cohere/rerank-4-fast"

    # Speech-to-text biasing (no extra latency): instruction language, vocabulary, context turns.
    stt_prompt_lang: str = "am"  # "am" or "en"
    stt_vocabulary: Annotated[list[str], NoDecode] = ["ኢንኮሞኮ=Inkomoko"]
    stt_context_turns: int = 4

    # RAG
    hybrid_alpha: float = 0.5
    retrieval_top_k: int = 30
    rerank_top_n: int = 8
    rerank_min_score: float = 0.05
    low_confidence_score: float = 0.3
    history_turns: int = 6
    answer_temperature: float = 0.2

    # Ingestion
    chunk_min_tokens: int = 450
    chunk_max_tokens: int = 1200
    contextual_retrieval: bool = True
    contextual_concurrency: int = 8
    pdf_pages_per_batch: int = 12
    max_upload_mb: int = 25
    embedding_batch_size: int = 32

    # Auth (demo)
    admin_username: str = "admin"
    admin_password: str = "admin123"
    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_ttl_hours: int = 8
    cookie_secure: bool = False

    # Web
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    rate_limit_chat: str = "30/minute"
    rate_limit_voice: str = "60/minute"

    # Worker
    worker_poll_seconds: float = 2.0
    gap_report_interval_minutes: int = 60
    gap_report_days: int = 30

    @field_validator("cors_origins", "stt_vocabulary", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip().startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
