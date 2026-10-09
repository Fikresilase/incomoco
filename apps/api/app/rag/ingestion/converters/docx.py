"""DOCX → Markdown in code, no LLM: Word heading styles become # levels."""

import asyncio
import io
import re

from docx import Document as load_docx
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.rag.ingestion.converters import ConvertedDocument

_HEADING_STYLE = re.compile(r"^heading\s*(\d)$", re.IGNORECASE)


def _paragraph_md(paragraph: Paragraph) -> str:
    text = paragraph.text.strip()
    if not text:
        return ""
    style = (paragraph.style.name if paragraph.style is not None else "") or ""
    if style.lower() == "title":
        return f"# {text}"
    match = _HEADING_STYLE.match(style)
    if match:
        return f"{'#' * min(int(match.group(1)), 6)} {text}"
    if "list" in style.lower():
        return f"- {text}"
    return text


def _table_md(table: Table) -> str:
    rows = [
        [cell.text.strip().replace("|", "\\|").replace("\n", " ") for cell in row.cells] for row in table.rows
    ]
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    lines = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(lines)


def docx_to_markdown(data: bytes) -> str:
    document = load_docx(io.BytesIO(data))
    parts: list[str] = []
    # Walk the body in order so tables stay where they appear in the document.
    for element in document.element.body.iterchildren():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "p":
            md = _paragraph_md(Paragraph(element, document))
        elif tag == "tbl":
            md = _table_md(Table(element, document))
        else:
            continue
        if md:
            parts.append(md)
    # Consecutive list items belong to one list block.
    out: list[str] = []
    for part in parts:
        if out and part.startswith("- ") and out[-1].split("\n")[-1].startswith("- "):
            out[-1] += "\n" + part
        else:
            out.append(part)
    return "\n\n".join(out)


class DocxConverter:
    async def convert(self, data: bytes, filename: str) -> ConvertedDocument:
        markdown = await asyncio.to_thread(docx_to_markdown, data)
        return ConvertedDocument(markdown=markdown)
