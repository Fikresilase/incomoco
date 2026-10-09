"""WAV helpers. Gemini TTS returns raw PCM; browsers need a container, and WAV is lossless and trivial."""

import io
import wave

DEFAULT_PCM_RATE = 24_000


def pcm_to_wav(pcm: bytes, rate: int = DEFAULT_PCM_RATE, channels: int = 1, sample_width: int = 2) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sample_width)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buffer.getvalue()


def join_wav(clips: list[bytes]) -> bytes:
    """Concatenate WAV clips with identical formats into one WAV (byte concatenation would corrupt it)."""
    clips = [c for c in clips if c]
    if not clips:
        return b""
    frames: list[bytes] = []
    params = None
    for clip in clips:
        with wave.open(io.BytesIO(clip), "rb") as w:
            params = params or (w.getnchannels(), w.getsampwidth(), w.getframerate())
            frames.append(w.readframes(w.getnframes()))
    channels, width, rate = params
    return pcm_to_wav(b"".join(frames), rate=rate, channels=channels, sample_width=width)


def wav_duration_ms(clip: bytes) -> int | None:
    try:
        with wave.open(io.BytesIO(clip), "rb") as w:
            return round(w.getnframes() / w.getframerate() * 1000)
    except (wave.Error, EOFError):
        return None
