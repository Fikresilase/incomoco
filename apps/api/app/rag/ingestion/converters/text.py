"""TXT / MD are used as-is (design doc §6.2)."""

from app.rag.ingestion.converters import ConvertedDocument


def decode_text(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


class TextConverter:
    async def convert(self, data: bytes, filename: str) -> ConvertedDocument:
        return ConvertedDocument(markdown=decode_text(data))
