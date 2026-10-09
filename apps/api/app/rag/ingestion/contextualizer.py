"""Contextual retrieval (design doc §6.3, step 6): 1-2 sentences situating each chunk."""

import asyncio
import logging

from app.domain.ports import LLMPort

logger = logging.getLogger(__name__)

_MAX_DOCUMENT_CHARS = 200_000

_PROMPT = """<document>
{document}
</document>

Here is a chunk we want to situate within the whole document:
<chunk>
{chunk}
</chunk>

Give a short, succinct context (1-2 sentences) to situate this chunk within the overall document, to improve search retrieval of the chunk. Write it in the same language as the chunk. Answer only with the succinct context and nothing else."""


class Contextualizer:
    def __init__(self, llm: LLMPort, concurrency: int = 8):
        self._llm = llm
        self._concurrency = concurrency

    async def contextualize(self, document_markdown: str, chunks: list[str]) -> list[str]:
        document = document_markdown[:_MAX_DOCUMENT_CHARS]
        semaphore = asyncio.Semaphore(self._concurrency)

        async def one(chunk: str) -> str:
            async with semaphore:
                try:
                    context = await self._llm.complete(
                        [{"role": "user", "content": _PROMPT.format(document=document, chunk=chunk)}],
                        temperature=0.0,
                        max_tokens=160,
                    )
                    return " ".join(context.split())
                except Exception:  # one failed call must not fail the whole document
                    logger.exception("Contextual retrieval failed for a chunk; continuing without context")
                    return ""

        return list(await asyncio.gather(*(one(c) for c in chunks)))
