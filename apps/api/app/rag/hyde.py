"""HyDE: Hypothetical Document Embeddings (design doc §6.1, stage 2)."""

from app.domain.models import ChatTurn
from app.domain.ports import LLMPort

_SYSTEM = (
    "You write a short passage that would directly answer the user's latest question, as it might appear "
    "in an official Inkomoko document. Inkomoko supports entrepreneurs and small businesses, including in "
    "displacement-affected communities, with business training, consulting, and access to finance. "
    "Use the conversation to resolve follow-up questions. Write 3-5 factual-sounding sentences in the same "
    "language as the latest question. Do not mention that the passage is hypothetical. Output only the passage."
)


def format_history(history: list[ChatTurn]) -> str:
    return "\n".join(f"{'User' if t.role == 'user' else 'Assistant'}: {t.content}" for t in history)


class HydeGenerator:
    def __init__(self, llm: LLMPort):
        self._llm = llm

    async def generate(self, question: str, history: list[ChatTurn]) -> str:
        prompt = question
        if history:
            prompt = f"Conversation so far:\n{format_history(history)}\n\nLatest question: {question}"
        passage = await self._llm.complete(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=250,
        )
        return passage.strip()
