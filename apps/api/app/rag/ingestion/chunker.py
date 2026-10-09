"""Structure-aware chunking (design doc §6.3).

Boundaries come from the document structure (sections → blocks → sentences); token counts
are only the size bounds (min 450 / max 1,200). No overlap: breadcrumbs carry the context.
"""

import re
from dataclasses import dataclass

from app.rag.ingestion.markdown_tree import Block, Section, parse_markdown
from app.rag.ingestion.tokens import estimate_tokens

_SENTENCE_END = re.compile(r"(?<=[.!?።፧])\s+")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{2,}")
BREADCRUMB_SEP = " › "


@dataclass
class Piece:
    path: list[str]
    text: str
    page_start: int | None
    page_end: int | None

    @property
    def tokens(self) -> int:
        return estimate_tokens(self.text)


@dataclass
class Chunk:
    index: int
    breadcrumb: str
    text: str
    page_start: int | None
    page_end: int | None


def _pages(*values: int | None) -> list[int]:
    return [v for v in values if v is not None]


def _render(section: Section) -> str:
    parts = [section.heading_line] if section.title else []
    parts += [b.text for b in section.blocks]
    parts += [_render(child) for child in section.children]
    return "\n\n".join(p for p in parts if p)


def _section_pages(section: Section) -> list[int]:
    pages = _pages(section.page)
    for block in section.blocks:
        pages += _pages(block.page_start, block.page_end)
    for child in section.children:
        pages += _section_pages(child)
    return pages


class StructureChunker:
    def __init__(self, min_tokens: int = 450, max_tokens: int = 1200):
        self.min_tokens = min_tokens
        self.max_tokens = max_tokens

    # ---- public -----------------------------------------------------------------

    def chunk(self, markdown: str, document_title: str) -> list[Chunk]:
        root = parse_markdown(markdown)
        pieces = self._merge_small(self._chunk_section(root, []))
        chunks = []
        for piece in pieces:
            if not piece.text.strip():
                continue
            breadcrumb = BREADCRUMB_SEP.join([document_title, *piece.path])
            chunks.append(
                Chunk(len(chunks), breadcrumb, piece.text.strip(), piece.page_start, piece.page_end)
            )
        return chunks

    # ---- steps 2-3: walk the tree, split what is too big --------------------------

    def _chunk_section(self, section: Section, parent_path: list[str]) -> list[Piece]:
        path = [*parent_path, section.title] if section.title else parent_path
        if not section.blocks and len(section.children) == 1:
            # A wrapper with a single subsection: descend so the breadcrumb stays specific.
            return self._chunk_section(section.children[0], path)
        rendered = _render(section)
        if estimate_tokens(rendered) <= self.max_tokens:
            pages = _section_pages(section)
            return [Piece(path, rendered, min(pages, default=None), max(pages, default=None))]

        # Too big: the section's own blocks first, then each subsection on its own.
        pieces = self._pack_blocks(section.blocks, path, section.heading_line, section.page)
        for child in section.children:
            pieces += self._chunk_section(child, path)
        return pieces

    def _pack_blocks(
        self, blocks: list[Block], path: list[str], heading: str, page: int | None
    ) -> list[Piece]:
        units: list[Block] = []
        for block in blocks:
            units += self._split_block(block) if estimate_tokens(block.text) > self.max_tokens else [block]

        pieces: list[Piece] = []
        texts: list[str] = [heading] if heading else []
        pages: list[int] = _pages(page)

        def flush() -> None:
            body = [t for t in texts if t and t != heading]
            if body:
                pieces.append(
                    Piece(
                        path,
                        "\n\n".join(t for t in texts if t),
                        min(pages, default=None),
                        max(pages, default=None),
                    )
                )

        for unit in units:
            candidate = "\n\n".join([*texts, unit.text])
            if texts and estimate_tokens(candidate) > self.max_tokens and any(t != heading for t in texts):
                flush()
                texts, pages = [], []
            texts.append(unit.text)
            pages += _pages(unit.page_start, unit.page_end)
        flush()
        return pieces

    # ---- step 3c: a single block larger than max --------------------------------

    def _split_block(self, block: Block) -> list[Block]:
        if block.kind == "table":
            return self._split_table(block)
        if block.kind == "code":
            return self._group(block, block.text.split("\n"), "\n")
        sentences = [s for s in _SENTENCE_END.split(block.text) if s.strip()]
        units: list[str] = []
        for sentence in sentences:
            if estimate_tokens(sentence) > self.max_tokens:
                units += self._split_words(sentence)
            else:
                units.append(sentence)
        return self._group(block, units, " ")

    def _split_table(self, block: Block) -> list[Block]:
        lines = block.text.split("\n")
        header_len = 2 if len(lines) > 1 and _TABLE_SEPARATOR.match(lines[1]) else 1
        header, rows = lines[:header_len], lines[header_len:]
        out: list[Block] = []
        current: list[str] = []
        for row in rows:
            if current and estimate_tokens("\n".join([*header, *current, row])) > self.max_tokens:
                out.append(Block("table", "\n".join([*header, *current]), block.page_start, block.page_end))
                current = []
            current.append(row)
        if current:
            out.append(Block("table", "\n".join([*header, *current]), block.page_start, block.page_end))
        return out

    def _split_words(self, text: str) -> list[str]:
        words, out, current = text.split(" "), [], []
        for word in words:
            if current and estimate_tokens(" ".join([*current, word])) > self.max_tokens:
                out.append(" ".join(current))
                current = []
            current.append(word)
        if current:
            out.append(" ".join(current))
        return out

    def _group(self, block: Block, units: list[str], joiner: str) -> list[Block]:
        out: list[Block] = []
        current: list[str] = []
        for unit in units:
            if current and estimate_tokens(joiner.join([*current, unit])) > self.max_tokens:
                out.append(Block(block.kind, joiner.join(current), block.page_start, block.page_end))
                current = []
            current.append(unit)
        if current:
            out.append(Block(block.kind, joiner.join(current), block.page_start, block.page_end))
        return out

    # ---- step 3b: merge pieces that are too small -----------------------------------

    def _merge_small(self, pieces: list[Piece]) -> list[Piece]:
        merged: list[Piece] = []
        for piece in pieces:
            if merged:
                prev = merged[-1]
                small = prev.tokens < self.min_tokens or piece.tokens < self.min_tokens
                fits = estimate_tokens(prev.text + "\n\n" + piece.text) <= self.max_tokens
                if small and fits and self._related(prev.path, piece.path):
                    merged[-1] = self._combine(prev, piece)
                    continue
            merged.append(piece)
        return merged

    @staticmethod
    def _common_prefix(a: list[str], b: list[str]) -> list[str]:
        prefix = []
        for x, y in zip(a, b, strict=False):
            if x != y:
                break
            prefix.append(x)
        return prefix

    def _related(self, a: list[str], b: list[str]) -> bool:
        """Siblings or parent/child under the same parent section."""
        return len(self._common_prefix(a, b)) >= max(0, min(len(a), len(b)) - 1)

    def _combine(self, a: Piece, b: Piece) -> Piece:
        pages = _pages(a.page_start, a.page_end, b.page_start, b.page_end)
        return Piece(
            self._common_prefix(a.path, b.path),
            f"{a.text}\n\n{b.text}",
            min(pages, default=None),
            max(pages, default=None),
        )
