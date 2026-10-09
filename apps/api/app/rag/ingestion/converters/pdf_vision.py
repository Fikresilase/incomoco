"""PDF → Markdown with Gemini vision, in page batches. No OCR engine (design doc D11)."""

import asyncio
import base64
import io
import logging

from pypdf import PdfReader, PdfWriter

from app.domain.ports import LLMPort
from app.rag.ingestion.converters import ConvertedDocument

logger = logging.getLogger(__name__)

_PROMPT = """Transcribe this PDF excerpt into clean Markdown. It contains pages {first} to {last} of the original document.

Rules:
- Transcribe VERBATIM. Do not summarize, paraphrase, translate, or add anything.
- Keep the original language and script (Amharic in Ge'ez script, English in Latin script).
- At the start of every page output a line exactly like: <<<PAGE n>>> (n = original page number, starting at {first}).
- Use Markdown headings (#, ##, ###) that match the document's real heading hierarchy.
- Render tables as Markdown tables. Render lists as Markdown lists.
- Describe each meaningful image or chart in one line: [Image: short description].
- Omit repeated page headers/footers and page numbers.
- Output only the Markdown, without code fences around it."""

_MAX_CONCURRENT_BATCHES = 4


class PdfVisionConverter:
    def __init__(self, llm: LLMPort, pages_per_batch: int = 12):
        self._llm = llm
        self._pages_per_batch = pages_per_batch

    async def convert(self, data: bytes, filename: str) -> ConvertedDocument:
        reader = PdfReader(io.BytesIO(data))
        page_count = len(reader.pages)
        batches = [
            (start, min(start + self._pages_per_batch, page_count))
            for start in range(0, page_count, self._pages_per_batch)
        ]
        semaphore = asyncio.Semaphore(_MAX_CONCURRENT_BATCHES)

        async def run(start: int, end: int) -> str:
            async with semaphore:
                return await self._transcribe_batch(reader, start, end, filename)

        parts = await asyncio.gather(*(run(s, e) for s, e in batches))
        return ConvertedDocument(markdown="\n\n".join(parts), page_count=page_count)

    async def _transcribe_batch(self, reader: PdfReader, start: int, end: int, filename: str) -> str:
        writer = PdfWriter()
        for index in range(start, end):
            writer.add_page(reader.pages[index])
        buffer = io.BytesIO()
        writer.write(buffer)
        data_url = "data:application/pdf;base64," + base64.b64encode(buffer.getvalue()).decode()

        content = [
            {"type": "text", "text": _PROMPT.format(first=start + 1, last=end)},
            {"type": "file", "file": {"filename": filename, "file_data": data_url}},
        ]
        markdown = await self._llm.complete(
            [{"role": "user", "content": content}],
            temperature=0.0,
            extra={"plugins": [{"id": "file-parser", "pdf": {"engine": "native"}}]},
        )
        markdown = _strip_fences(markdown)
        if "<<<PAGE" not in markdown:
            # Keep page attribution for citations even if the model skipped the markers.
            markdown = f"<<<PAGE {start + 1}>>>\n{markdown}"
        logger.info("Transcribed pages %s-%s of %s", start + 1, end, filename)
        return markdown


def _strip_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[1] if "\n" in stripped else ""
        if stripped.rstrip().endswith("```"):
            stripped = stripped.rstrip()[:-3]
    return stripped.strip()
