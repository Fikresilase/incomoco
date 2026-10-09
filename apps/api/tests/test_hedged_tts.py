import asyncio
import time

import pytest

from app.adapters.hedged_tts import HedgedTTS, TTSTimeoutError


class ScriptedTTS:
    """Each call takes the next (delay, result) from the script; result may be an exception."""

    model, voice, audio_format, content_type = "m", "v", "wav", "audio/wav"

    def __init__(self, script):
        self.script = list(script)
        self.calls = 0

    async def synthesize(self, text: str, lang: str) -> bytes:
        delay, result = self.script[self.calls]
        self.calls += 1
        await asyncio.sleep(delay)
        if isinstance(result, Exception):
            raise result
        return result


async def test_fast_request_needs_no_backup():
    inner = ScriptedTTS([(0.01, b"a")])
    assert await HedgedTTS(inner, hedge_after=0.2, timeout=2).synthesize("hi", "en") == b"a"
    assert inner.calls == 1


async def test_slow_request_is_hedged_and_backup_wins():
    inner = ScriptedTTS([(5.0, b"slow"), (0.01, b"backup")])
    started = time.perf_counter()
    assert await HedgedTTS(inner, hedge_after=0.05, timeout=2).synthesize("hi", "en") == b"backup"
    assert time.perf_counter() - started < 1.0  # didn't wait for the 5 s outlier
    assert inner.calls == 2


async def test_slow_primary_can_still_win_the_race():
    inner = ScriptedTTS([(0.1, b"primary"), (5.0, b"backup")])
    assert await HedgedTTS(inner, hedge_after=0.05, timeout=2).synthesize("hi", "en") == b"primary"


async def test_failed_request_is_retried_immediately():
    inner = ScriptedTTS([(0.0, RuntimeError("502")), (0.01, b"retry")])
    started = time.perf_counter()
    assert await HedgedTTS(inner, hedge_after=1.0, timeout=2).synthesize("hi", "en") == b"retry"
    assert time.perf_counter() - started < 0.5  # no waiting for the hedge delay


async def test_both_failing_raises_and_both_slow_times_out():
    failing = ScriptedTTS([(0.0, RuntimeError("one")), (0.0, RuntimeError("two"))])
    with pytest.raises(RuntimeError, match="two"):
        await HedgedTTS(failing, hedge_after=0.05, timeout=2).synthesize("hi", "en")
    slow = ScriptedTTS([(5.0, b"x"), (5.0, b"y")])
    with pytest.raises(TTSTimeoutError):
        await HedgedTTS(slow, hedge_after=0.05, timeout=0.2).synthesize("hi", "en")
