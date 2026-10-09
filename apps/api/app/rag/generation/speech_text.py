"""Text helpers for speech: strip Markdown/citations and split into sentences for TTS."""

import re

_CITATION = re.compile(r"\s*\[\d+\](?:\[\d+\])*")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_MARKS = re.compile(r"(\*\*|__|\*|_|`|~~|^#{1,6}\s+|^\s*[-*+]\s+|^\s*>\s?)", re.MULTILINE)
_TABLE_LINE = re.compile(r"^\s*\|.*$", re.MULTILINE)
_SENTENCE = re.compile(r"(.+?(?:[.!?።፧]+|\n+))(?=\s|$)", re.DOTALL)


def to_speakable(text: str) -> str:
    text = _CITATION.sub("", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _TABLE_LINE.sub("", text)
    text = _MD_MARKS.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


class SentenceSplitter:
    """Accumulates streamed text and emits complete sentences, so TTS can start early."""

    def __init__(self, min_chars: int = 24):
        self._buffer = ""
        self._min_chars = min_chars

    def feed(self, delta: str) -> list[str]:
        self._buffer += delta
        sentences: list[str] = []
        pending = ""
        while True:
            match = _SENTENCE.match(self._buffer)
            if not match:
                break
            pending += match.group(1)
            self._buffer = self._buffer[match.end() :]
            if len(to_speakable(pending)) >= self._min_chars:
                sentences.append(pending)
                pending = ""
        self._buffer = pending + self._buffer
        return [s for s in (to_speakable(x) for x in sentences) if s]

    def flush(self) -> list[str]:
        rest, self._buffer = to_speakable(self._buffer), ""
        return [rest] if rest else []


def split_sentences(text: str, max_chars: int = 400) -> list[str]:
    """Split a full answer into TTS-sized pieces (for read-aloud)."""
    splitter = SentenceSplitter()
    pieces = splitter.feed(text) + splitter.flush()
    out: list[str] = []
    for piece in pieces:
        if out and len(out[-1]) + len(piece) < max_chars:
            out[-1] += " " + piece
        else:
            out.append(piece)
    return out
