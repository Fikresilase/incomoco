"""Speech-to-text prompt: instructions (Amharic or English), vocabulary, and conversation context.

Gemini transcribes from a prompt, so recognition can be biased without extra latency:
- vocabulary gives the exact spellings of names/terms that are easy to mishear (e.g. ኢንኮሞኮ);
- recent turns let the model resolve unclear words by topic.
"""

from dataclasses import dataclass

from app.domain.models import ChatTurn

_INSTRUCTIONS = {
    "am": (
        "ይህንን ኦዲዮ ቃል በቃል ይጻፉ። ተናጋሪው አማርኛ ወይም እንግሊዝኛ (አንዳንዴም የተቀላቀለ) ይጠቀማል።\n"
        "አማርኛን በግዕዝ (ኢትዮጵያዊ) ፊደላት፣ እንግሊዝኛን ደግሞ በላቲን ፊደላት ይጻፉ።\n"
        "የተጻፈውን ጽሑፍ ብቻ ያቅርቡ፤ ጥቅሶች፣ መለያዎች፣ ትርጉም ወይም አስተያየት አይካተቱ።\n"
        "ሊረዳ የሚችል ንግግር ከሌለ ምንም ነገር አያቅርቡ።"
    ),
    "en": (
        "Transcribe this audio verbatim. The speaker uses Amharic or English (sometimes mixed).\n"
        "Write Amharic in Ge'ez (Ethiopic) script and English in Latin script.\n"
        "Output ONLY the transcript text: no quotes, labels, translation, or commentary.\n"
        "If there is no intelligible speech, output nothing."
    ),
}

# Kept bilingual whichever instruction language is used: English words must stay in Latin script.
_SCRIPT_RULE = "የእንግሊዝኛ ቃላት በላቲን ፊደላት ይቆዩ / English words stay in Latin letters (e.g. Inkomoko, loan)."
_VOCAB_HEADER = "መዝገበ ቃላት / Vocabulary: when these are spoken, use exactly these spellings:"
_CONTEXT_HEADER = "የቅርብ ጊዜ ውይይት (ለአውድ ብቻ፤ አይጻፉት) / Recent conversation (context only; do NOT transcribe it):"
_MAX_TURN_CHARS = 300


@dataclass(frozen=True, slots=True)
class VocabularyTerm:
    amharic: str
    english: str | None = None

    @classmethod
    def parse(cls, entry: str) -> "VocabularyTerm":
        """'ኢንኮሞኮ=Inkomoko' → Amharic + English spellings; a bare term is used as-is."""
        amharic, _, english = entry.partition("=")
        return cls(amharic.strip(), english.strip() or None)

    def render(self) -> str:
        return f"- {self.amharic} (አማርኛ) / {self.english} (English)" if self.english else f"- {self.amharic}"


def build_transcription_prompt(
    *, prompt_lang: str, vocabulary: list[VocabularyTerm], context: list[ChatTurn] | None = None
) -> str:
    parts = [_INSTRUCTIONS.get(prompt_lang, _INSTRUCTIONS["am"]), _SCRIPT_RULE]
    if vocabulary:
        parts.append(_VOCAB_HEADER + "\n" + "\n".join(term.render() for term in vocabulary))
    if context:
        lines = []
        for turn in context:
            text = " ".join(turn.content.split())[:_MAX_TURN_CHARS]
            lines.append(f"{'User' if turn.role == 'user' else 'Assistant'}: {text}")
        parts.append(_CONTEXT_HEADER + "\n" + "\n".join(lines))
    return "\n\n".join(parts)
