import base64

from app.adapters.openrouter.client import OpenRouterClient
from app.adapters.openrouter.llm import OpenRouterLLM
from app.core.audio import DEFAULT_PCM_RATE, pcm_to_wav
from app.domain.models import ChatTurn
from app.rag.transcription import VocabularyTerm, build_transcription_prompt


class GeminiChatSTT:
    """STTPort using the main Gemini model's audio input through chat completions.

    The prompt carries the instructions, vocabulary, and recent conversation (see rag/transcription.py).
    """

    def __init__(self, llm: OpenRouterLLM, *, prompt_lang: str, vocabulary: list[VocabularyTerm]):
        self._llm = llm
        self._prompt_lang = prompt_lang
        self._vocabulary = vocabulary

    async def transcribe(
        self,
        audio: bytes,
        audio_format: str = "wav",
        context: list[ChatTurn] | None = None,
        *,
        language_hint: str | None = None,
    ) -> str:
        prompt = build_transcription_prompt(
            prompt_lang=language_hint or self._prompt_lang, vocabulary=self._vocabulary, context=context
        )
        content = [
            {"type": "text", "text": prompt},
            {
                "type": "input_audio",
                "input_audio": {"data": base64.b64encode(audio).decode(), "format": audio_format},
            },
        ]
        text = await self._llm.complete([{"role": "user", "content": content}], temperature=0.0)
        return text.strip().strip('"').strip()


class OpenRouterTTS:
    """TTSPort over OpenRouter /audio/speech (Gemini 3.8 Flash Lite TTS).

    Gemini TTS only returns raw PCM (`audio/pcm;rate=24000;channels=1`), so it is wrapped in WAV here.
    """

    audio_format = "wav"
    content_type = "audio/wav"

    def __init__(self, client: OpenRouterClient, model: str, voice: str, allowed_langs: list[str]):
        self._client = client
        self._allowed_langs = set(allowed_langs)
        self.model = model
        self.voice = voice

    def supports(self, lang: str) -> bool:
        return lang in self._allowed_langs

    async def synthesize(self, text: str, lang: str) -> bytes:
        if not self.supports(lang):
            raise ValueError(f"TTS is not enabled for language {lang!r}")
        language = {
            "am": "Amharic",
            "om": "Afaan Oromo",
            "so": "Somali",
            "en": "English",
        }.get(lang, "English")
        response = await self._client.http.post(
            "/audio/speech",
            json={
                "model": self.model,
                "input": text,
                "voice": self.voice,
                "response_format": "pcm",
                "instructions": f"Speak naturally in {language}, in a warm, clear, and friendly tone.",
            },
        )
        OpenRouterClient.raise_for_status(response)
        params = _content_type_params(response.headers.get("content-type", ""))
        return pcm_to_wav(
            response.content,
            rate=int(params.get("rate", DEFAULT_PCM_RATE)),
            channels=int(params.get("channels", 1)),
        )


def _content_type_params(content_type: str) -> dict[str, str]:
    """'audio/pcm;rate=24000;channels=1' -> {'rate': '24000', 'channels': '1'}"""
    params = {}
    for part in content_type.split(";")[1:]:
        key, _, value = part.strip().partition("=")
        if key and value:
            params[key.lower()] = value
    return params
