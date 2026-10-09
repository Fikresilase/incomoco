"""Document → Markdown converters (design doc §6.2)."""

from dataclasses import dataclass
from pathlib import PurePath
from typing import Protocol

SUPPORTED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


@dataclass(slots=True)
class ConvertedDocument:
    markdown: str
    page_count: int | None = None


class DocumentConverter(Protocol):
    async def convert(self, data: bytes, filename: str) -> ConvertedDocument: ...


class UnsupportedDocumentError(ValueError):
    pass


def extension_of(filename: str) -> str:
    return PurePath(filename).suffix.lower()


class ConverterRegistry:
    """Picks the converter by file extension, so services never branch on file type."""

    def __init__(self, converters: dict[str, DocumentConverter]):
        self._converters = converters

    async def convert(self, data: bytes, filename: str) -> ConvertedDocument:
        converter = self._converters.get(extension_of(filename))
        if converter is None:
            raise UnsupportedDocumentError(f"Unsupported file type: {filename}")
        return await converter.convert(data, filename)
