"""Streaming answer generation with no-answer detection (design doc §6.1, stage 6)."""

from collections.abc import AsyncIterator

from app.domain.models import ChatTurn, Lang, LLMUsage, RetrievedChunk
from app.domain.ports import LLMPort
from app.rag.generation.prompts import NO_ANSWER_MARKER, build_answer_messages


class AnswerStream:
    """Streams answer text, stripping the leading no-answer marker and recording it."""

    def __init__(self, llm: LLMPort, temperature: float):
        self._llm = llm
        self._temperature = temperature
        self.no_answer = False
        self.usage = LLMUsage()

    async def stream(
        self, question: str, history: list[ChatTurn], chunks: list[RetrievedChunk], lang: Lang, *, voice: bool
    ) -> AsyncIterator[str]:
        messages = build_answer_messages(question, history, chunks, lang, voice=voice)
        buffer = ""
        deciding = True
        async for delta in self._llm.stream(messages, temperature=self._temperature, usage=self.usage):
            if not deciding:
                yield delta
                continue
            buffer += delta
            stripped = buffer.lstrip()
            if stripped.startswith(NO_ANSWER_MARKER):
                self.no_answer = True
                buffer = stripped[len(NO_ANSWER_MARKER) :].lstrip()
                deciding = False
            elif len(stripped) >= len(NO_ANSWER_MARKER) or not NO_ANSWER_MARKER.startswith(stripped):
                deciding = False
            if not deciding and buffer:
                yield buffer
                buffer = ""
        if buffer:
            yield buffer
