"""Hedged TTS: protects against slow outlier requests (tail latency).

Gemini TTS usually answers in ~2-3 s, but an occasional request takes 15 s+. Live-talk clips play
in order, so one slow clip stalls everything behind it. This wrapper starts a backup request if the
first hasn't finished after `hedge_after` seconds (or immediately if it fails), and returns
whichever succeeds first, cancelling the other. Implements TTSPort, so callers don't change.
"""

import asyncio
import logging

from app.domain.ports import TTSPort

logger = logging.getLogger(__name__)


class TTSTimeoutError(TimeoutError):
    pass


class HedgedTTS:
    def __init__(self, inner: TTSPort, *, hedge_after: float = 6.0, timeout: float = 20.0):
        self._inner = inner
        self._hedge_after = hedge_after
        self._timeout = timeout
        self.model = inner.model
        self.voice = inner.voice
        self.audio_format = inner.audio_format
        self.content_type = inner.content_type

    async def synthesize(self, text: str, lang: str) -> bytes:
        try:
            return await asyncio.wait_for(self._race(text, lang), timeout=self._timeout)
        except TimeoutError as exc:
            raise TTSTimeoutError(f"TTS did not finish within {self._timeout:.0f}s") from exc

    async def _race(self, text: str, lang: str) -> bytes:
        primary = asyncio.create_task(self._inner.synthesize(text, lang))
        tasks = {primary}
        try:
            done, _ = await asyncio.wait(tasks, timeout=self._hedge_after)
            if primary in done and primary.exception() is None:
                return primary.result()
            reason = "failed" if done else f"slower than {self._hedge_after:.0f}s"
            logger.warning("TTS request %s; sending a backup request", reason)
            if done:
                tasks.clear()  # the failed primary is out of the race
            tasks.add(asyncio.create_task(self._inner.synthesize(text, lang)))

            last_error: BaseException | None = primary.exception() if done else None
            while tasks:
                done, tasks = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if task.exception() is None:
                        return task.result()
                    last_error = task.exception()
            raise last_error or RuntimeError("TTS failed")
        finally:
            for task in tasks | {primary}:
                if not task.done():
                    task.cancel()
