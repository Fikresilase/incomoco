"""Fast local token estimate used only for the chunk size bounds (design doc §6.3).

Exact counts are not needed: the 450/1,200 bounds are soft. Ethiopic script tokenizes
denser than Latin text, so it is weighted separately.
"""

import re

_ETHIOPIC = re.compile(r"[ሀ-᎟ⶀ-⷟꬀-꬯]")
_ETHIOPIC_CHARS_PER_TOKEN = 2.0
_OTHER_CHARS_PER_TOKEN = 4.0


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    ethiopic = len(_ETHIOPIC.findall(text))
    other = len(text) - ethiopic
    return max(1, round(ethiopic / _ETHIOPIC_CHARS_PER_TOKEN + other / _OTHER_CHARS_PER_TOKEN))
