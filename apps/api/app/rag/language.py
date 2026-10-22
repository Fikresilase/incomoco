"""Script-based language detection (design doc §6.1, stage 1): no API call."""

import re

from app.domain.models import Lang

SUPPORTED_LANGS = {"am", "om", "so", "en"}


def coerce_lang(value: str | None) -> Lang | None:
    return value if value in SUPPORTED_LANGS else None  # type: ignore[return-value]

_ETHIOPIC = re.compile(r"[ሀ-᎟ⶀ-⷟꬀-꬯]")
_LATIN = re.compile(r"[A-Za-z]")


def script_counts(text: str) -> tuple[int, int]:
    """Words per script. Words, not characters: one Ethiopic character is a whole syllable."""
    ethiopic = latin = 0
    for word in text.split():
        if _ETHIOPIC.search(word):
            ethiopic += 1
        elif _LATIN.search(word):
            latin += 1
    return ethiopic, latin


def detect_lang(text: str) -> Lang:
    """Best-effort fallback only. Prefer explicit user or conversation language."""
    ethiopic, latin = script_counts(text)
    return "am" if ethiopic > 0 and ethiopic >= latin else "en"


def detect_document_lang(text: str) -> str:
    ethiopic, latin = script_counts(text)
    total = ethiopic + latin
    if total == 0:
        return "en"
    share = ethiopic / total
    if share >= 0.8:
        return "am"
    if share <= 0.2:
        return "en"
    return "mixed"
