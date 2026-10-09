"""Parse Markdown into a section tree of atomic blocks (design doc §6.3, step 1).

Page markers `<<<PAGE n>>>` (emitted by the PDF vision converter) are tracked so every
block knows which pages it came from; they never appear in block text.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

BlockKind = Literal["paragraph", "list", "table", "code", "quote"]

PAGE_MARKER = re.compile(r"^\s*<<<PAGE\s+(\d+)>>>\s*$")
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE = re.compile(r"^\s*(```|~~~)")
_TABLE = re.compile(r"^\s*\|")
_LIST = re.compile(r"^\s*([-*+]|\d+[.)])\s+")
_QUOTE = re.compile(r"^\s*>")


@dataclass
class Block:
    kind: BlockKind
    text: str
    page_start: int | None = None
    page_end: int | None = None


@dataclass
class Section:
    title: str | None
    level: int
    blocks: list[Block] = field(default_factory=list)
    children: list["Section"] = field(default_factory=list)
    page: int | None = None

    @property
    def heading_line(self) -> str:
        return f"{'#' * self.level} {self.title}" if self.title else ""


def _line_kind(line: str) -> BlockKind:
    if _TABLE.match(line):
        return "table"
    if _LIST.match(line):
        return "list"
    if _QUOTE.match(line):
        return "quote"
    return "paragraph"


def parse_markdown(markdown: str) -> Section:
    root = Section(title=None, level=0)
    stack: list[Section] = [root]
    page: int | None = None

    buffer: list[str] = []
    buffer_kind: BlockKind | None = None
    buffer_page: int | None = None
    in_fence = False

    def flush() -> None:
        nonlocal buffer, buffer_kind
        if buffer and buffer_kind:
            text = "\n".join(buffer).strip("\n")
            if text.strip():
                stack[-1].blocks.append(Block(buffer_kind, text, buffer_page, page))
        buffer, buffer_kind = [], None

    def start(kind: BlockKind, line: str) -> None:
        nonlocal buffer_kind, buffer_page
        flush()
        buffer.append(line)
        buffer_kind, buffer_page = kind, page

    for raw in markdown.replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()

        if in_fence:
            buffer.append(line)
            if _FENCE.match(line):
                in_fence = False
                flush()
            continue

        marker = PAGE_MARKER.match(line)
        if marker:
            page = int(marker.group(1))
            # Tables and lists that span a page break stay one block.
            if buffer_kind not in ("table", "list"):
                flush()
            continue

        if _FENCE.match(line):
            start("code", line)
            in_fence = True
            continue

        heading = _HEADING.match(line)
        if heading:
            flush()
            level = len(heading.group(1))
            section = Section(title=heading.group(2).strip(), level=level, page=page)
            while stack[-1].level >= level:
                stack.pop()
            stack[-1].children.append(section)
            stack.append(section)
            continue

        if not line.strip():
            if buffer_kind in ("paragraph", "quote", "table"):
                flush()
            elif buffer_kind == "list":
                buffer.append("")  # a list may continue after a blank line
            continue

        kind = _line_kind(line)
        if buffer_kind == "list" and (kind == "list" or line.startswith((" ", "\t"))):
            buffer.append(line)
        elif buffer_kind == kind and kind in ("paragraph", "table", "quote"):
            buffer.append(line)
        else:
            start(kind, line)

    flush()
    return root
