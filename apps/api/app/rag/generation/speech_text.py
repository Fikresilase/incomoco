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


# A clause break: comma/semicolon/colon (Latin or Ethiopic) followed by whitespace, so "1,000" never splits.
_ETHIOPIC = re.compile(r"[ሀ-᎟ⶀ-⷟꬀-꬯]")
_CLAUSE_END = re.compile(r"[,;:፣፤፥፦](?=\s)")


def _spoken_length(text: str) -> int:
    """Length in Latin-equivalent characters: one Ge'ez character is a whole syllable (~2 letters)."""
    return len(text) + len(_ETHIOPIC.findall(text))


class SentenceSplitter:
    """Accumulates streamed text and emits complete sentences, so TTS can start early.

    With `first_clause_words`, the FIRST piece may end early at a clause break once it has that many
    words, so the first audio is short and fast to synthesize (TTS time grows with text length).
    Later pieces always end on full sentences. Without a clause break, the first full sentence is used.
    """

    def __init__(self, min_chars: int = 24, first_clause_words: int = 0):
        self._buffer = ""
        self._min_chars = min_chars
        self._first_clause_words = first_clause_words
        self._emitted_any = False
        self.first_was_clause = False

    def _take_first_clause(self) -> str | None:
        sentence = _SENTENCE.match(self._buffer)
        limit = sentence.end() if sentence else len(self._buffer)
        for match in _CLAUSE_END.finditer(self._buffer, 0, limit):
            clause = self._buffer[: match.end()]
            if len(to_speakable(clause).split()) >= self._first_clause_words:
                self._buffer = self._buffer[match.end() :]
                return clause
        return None

    def feed(self, delta: str) -> list[str]:
        self._buffer += delta
        sentences: list[str] = []
        if self._first_clause_words and not self._emitted_any:
            clause = self._take_first_clause()
            if clause is not None:
                sentences.append(clause)
                self.first_was_clause = True
        pending = ""
        while True:
            match = _SENTENCE.match(self._buffer)
            if not match:
                break
            pending += match.group(1)
            self._buffer = self._buffer[match.end() :]
            if _spoken_length(to_speakable(pending)) >= self._min_chars:
                sentences.append(pending)
                pending = ""
        self._buffer = pending + self._buffer
        out = [s for s in (to_speakable(x) for x in sentences) if s]
        self._emitted_any = self._emitted_any or bool(out)
        return out

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
