"""Deterministic offline adapters (AI_PROVIDER=fake) for tests and key-less local runs.

They implement the same ports as the OpenRouter adapters, so the whole pipeline
(ingestion → hybrid search → rerank → streaming answer) runs end to end without network.
"""

import hashlib
import math
import re
from collections.abc import Sequence
from typing import Any

from app.core.audio import pcm_to_wav
from app.domain.models import LLMUsage, RerankResult

_WORD = re.compile(r"\w+", re.UNICODE)
_DIM = 256


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in _WORD.findall(text)]


def _last_user_text(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message["role"] == "user":
            content = message["content"]
            if isinstance(content, str):
                return content
            return " ".join(part.get("text", "") for part in content if part.get("type") == "text")
    return ""


class FakeLLM:
    model = "fake/llm"

    async def complete(self, messages, *, temperature=0.2, max_tokens=None, extra=None) -> str:
        prompt = _last_user_text(messages)
        system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
        if '"route"' in system:
            latest = prompt.rsplit("Latest message:", 1)[-1].lower()
            if any(w in latest for w in ("hello", "hi ", "thank", "how are you")):
                return '{"route": "direct", "say": "Hi! I am doing well, thanks for asking."}'
            return '{"route": "search", "say": "Good question, give me a moment to look that up."}'
        if "situate" in prompt.lower():
            return "This chunk is part of the uploaded document."
        if "topics" in prompt.lower() and "json" in prompt.lower():
            return '[{"topic": "General questions", "count": 1, "examples": ["example"]}]'
        return f"A passage that answers: {prompt[-300:]}"

    async def stream(self, messages, *, temperature=0.2, max_tokens=None, usage: LLMUsage | None = None):
        system = messages[0]["content"] if messages else ""
        if "(no relevant sources found)" in system:
            answer = "[[NO_ANSWER]] I could not find that in the knowledge base."
        else:
            answer = "Based on the knowledge base [1], here is a short answer."
        for word in answer.split(" "):
            yield word + " "
        if usage is not None:
            usage.tokens_in, usage.tokens_out = 100, 20


class FakeEmbedder:
    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            vec = [0.0] * _DIM
            for token in _tokens(text):
                vec[int(hashlib.md5(token.encode()).hexdigest(), 16) % _DIM] += 1.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            vectors.append([v / norm for v in vec])
        return vectors


class FakeReranker:
    async def rerank(self, query: str, documents: Sequence[str], top_n: int) -> list[RerankResult]:
        q = set(_tokens(query))
        scored = [
            RerankResult(index=i, score=len(q & set(_tokens(doc))) / (len(q) or 1))
            for i, doc in enumerate(documents)
        ]
        return sorted(scored, key=lambda r: r.score, reverse=True)[:top_n]


class FakeSTT:
    """Deterministic by clip length: tiny = silence, ~2 s+ = a greeting, otherwise a question."""

    async def transcribe(self, audio: bytes, audio_format: str = "wav", context=None) -> str:
        if len(audio) <= 1000:
            return ""
        if len(audio) >= 64_000:
            return "Hello, how are you?"
        return "What services does Inkomoko offer?"


class FakeTTS:
    model = "fake/tts"
    voice = "fake"
    audio_format = "wav"
    content_type = "audio/wav"

    async def synthesize(self, text: str, lang: str) -> bytes:
        return pcm_to_wav(bytes(4800))  # 0.1 s of silence at 24 kHz
