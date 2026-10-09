"""Text normalization for BM25 matching (design doc §6.2).

Applied to `search_text` and to the BM25 side of the query only; display text is untouched.
Amharic homophones are unified and punctuation (including Ethiopic) becomes whitespace, so the
same word always produces the same BM25 token regardless of spelling variant.
"""

import re
import unicodedata

# Homophone consonant series that are spelled interchangeably in practice.
# Each entry maps the first character of a variant series onto the canonical series;
# the seven vowel orders (offsets 0-6) are mapped one to one.
_HOMOPHONE_SERIES = {
    0x1210: 0x1200,  # ሐ → ሀ
    0x1280: 0x1200,  # ኀ → ሀ
    0x1220: 0x1230,  # ሠ → ሰ
    0x12D0: 0x12A0,  # ዐ → አ
    0x1340: 0x1338,  # ፀ → ጸ
}

_CHAR_MAP: dict[int, str] = {}
for variant, canonical in _HOMOPHONE_SERIES.items():
    for order in range(7):
        _CHAR_MAP[variant + order] = chr(canonical + order)

# Ethiopic punctuation → spaces / Latin equivalents so the tokenizer splits words correctly.
_CHAR_MAP.update(
    {
        0x1361: " ",  # ፡ word separator
        0x1362: ". ",  # ። full stop
        0x1363: ", ",  # ፣ comma
        0x1364: "; ",  # ፤ semicolon
        0x1365: ": ",  # ፥ colon
        0x1366: ": ",  # ፦ preface colon
        0x1367: "? ",  # ፧ question mark
        0x1368: " ",  # ፨ paragraph separator
    }
)

_NON_WORD = re.compile(r"[^\w]+")


def normalize_for_search(text: str) -> str:
    text = unicodedata.normalize("NFC", text).translate(_CHAR_MAP)
    return _NON_WORD.sub(" ", text).strip().lower()
