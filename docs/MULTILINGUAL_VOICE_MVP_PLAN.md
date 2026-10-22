# Multilingual Voice MVP Plan

Assessment date: 2026-10-13

Scope: prepare Inkomoko Assistant for multilingual voice input and output for Amharic and Afaan Oromo, with Somali if feasible. This plan inspects the existing implementation and proposes architecture and implementation tasks. It does not integrate Ethio-ASR and does not change current application behavior.

## 1. Existing STT Architecture

### Current STT Provider and Model

The current speech-to-text path uses `GeminiChatSTT` in `apps/api/app/adapters/openrouter/speech.py`.

It is not a dedicated ASR SDK. It sends the audio as a chat-completions audio input through the existing OpenRouter LLM adapter:

- `GeminiChatSTT.transcribe(...)`
- builds a transcription prompt with `build_transcription_prompt(...)`
- sends content containing:
  - text instructions
  - `input_audio` with base64-encoded WAV data
- calls `OpenRouterLLM.complete(...)`

The actual model used for STT is the configured `LLM_MODEL`, not a separate `STT_MODEL`. Current `.env.example` config:

```env
AI_PROVIDER=openrouter
LLM_MODEL=google/gemini-3.5-flash-lite
TTS_MODEL=google/gemini-3.8-flash-lite-tts
TTS_VOICE=Kore
STT_PROMPT_LANG=am
STT_VOCABULARY=ኢንኮሞኮ=Inkomoko
STT_CONTEXT_TURNS=4
```

The app also has `FakeSTT` for `AI_PROVIDER=fake`, used for local/test runs.

### Current Voice API Endpoints

Existing voice router: `apps/api/app/api/v1/voice.py`

Endpoints:

- `POST /api/v1/voice/transcribe`
  - multipart field `audio`
  - optional form field `conversation_id`
  - limit: `2 MB`, approximately 60 seconds of 16 kHz mono PCM16 WAV
  - returns `{ "text": string, "lang": string }`

- `POST /api/v1/voice/speak`
  - body: `{ "message_id": uuid }`
  - requires message to belong to the current browser session
  - returns `audio/wav`
  - caches generated TTS in MinIO and stores metadata in `message_audio`

- `WS /api/v1/voice/live`
  - live talk WebSocket
  - receives WAV utterance bytes
  - runs STT, RAG answer, streamed text, sentence-level TTS, and ordered audio playback

### Existing Frontend Microphone Components

Dictation:

- `apps/web/features/voice/components/dictation-button.tsx`
- `apps/web/features/voice/hooks/use-dictation.ts`
- `apps/web/lib/audio/recorder.ts`
- `apps/web/features/voice/api.ts`

The dictation flow:

1. Browser asks for microphone access with `navigator.mediaDevices.getUserMedia`.
2. Recorder captures mono audio through `AudioContext`.
3. Client encodes audio to 16 kHz mono WAV.
4. Client posts the WAV to `/voice/transcribe`.
5. Returned text is inserted into the composer for editing.
6. Dictated text is not auto-sent.

Live talk:

- `apps/web/features/voice/components/live-talk-button.tsx`
- `apps/web/features/voice/hooks/use-live-talk.ts`
- `apps/web/features/voice/vad.ts`
- `apps/web/lib/audio/playback-queue.ts`

The live talk flow:

1. Browser records utterances.
2. WebSocket sends audio to `/voice/live`.
3. Backend returns transcript, assistant text deltas, sources, and audio chunks.
4. Frontend plays audio chunks in order through `PlaybackQueue`.

### Current Language Selection Behavior

Current backend language type:

```python
Lang = Literal["am", "en"]
```

Current frontend language type:

```ts
export type Lang = "am" | "en";
```

Current language detection:

- `apps/api/app/rag/language.py`
- Ethiopic script dominating text => `am`
- otherwise => `en`

This means Afaan Oromo and Somali, both Latin-script languages, will currently be classified as English. They are not first-class languages yet.

Current STT prompt supports instruction language `am` or `en` only. It tells Gemini to transcribe Amharic or English, sometimes mixed, and to keep English in Latin script. It does not yet explicitly instruct Afaan Oromo or Somali transcription.

### Existing TTS

TTS already exists.

Backend:

- `TTSPort` exists in `apps/api/app/domain/ports.py`.
- `OpenRouterTTS` exists in `apps/api/app/adapters/openrouter/speech.py`.
- `HedgedTTS` wraps the provider for tail-latency protection.
- `VoiceService.synthesize_text(...)` splits long text and synthesizes sentence groups in parallel.
- `VoiceService.speak_message(...)` returns cached or newly generated WAV for an assistant message.
- `LiveTalkSession` uses `self.c.tts.synthesize(...)` to stream spoken replies during live talk.

Frontend:

- `useReadAloud` calls `POST /voice/speak`.
- `MessageActions` already renders a read-aloud button using `Volume2`, `Square`, and loading states.
- `clip-player.ts` plays one assistant-message audio clip at a time.

Important current limitation:

- The current TTS adapter maps `lang == "am"` to `"Amharic"` and everything else to `"English"`.
- It does not know `om` or `so`.
- The app types and database constraints do not yet allow `om` or `so` as message language.

### Available Provider Configuration

Current configurable provider settings:

- `AI_PROVIDER`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `LLM_MODEL`
- `TTS_MODEL`
- `TTS_VOICE`
- `STT_PROMPT_LANG`
- `STT_VOCABULARY`
- `STT_CONTEXT_TURNS`
- TTS latency guards:
  - `TTS_HEDGE_AFTER_SECONDS`
  - `TTS_TIMEOUT_SECONDS`
  - `TTS_FIRST_CLAUSE_WORDS`
  - `TTS_CLAUSE_PAUSE_MS`

Current backend dependencies include `httpx`, but no Azure Speech SDK, ElevenLabs SDK, Google Cloud SDK, or local TTS runtime.

## 2. Current Language Support and STT Verification

### What Is Verified in Code

Verified by code inspection:

- The STT adapter can accept WAV audio and prompt Gemini through OpenRouter.
- The frontend records 16 kHz mono WAV for dictation.
- The backend returns transcript text plus a detected language.
- Existing language detection only returns `am` or `en`.
- Conversation context and vocabulary can bias transcription.
- There is no dedicated STT language parameter in the `/voice/transcribe` endpoint.

### What Is Not Verified

We cannot claim real-world STT accuracy for Amharic, Afaan Oromo, or Somali without real recordings and reference transcripts.

Current status by language:

| Language | Current code path | Current classification | Accuracy status |
|---|---|---|---|
| Amharic (`am`) | Supported by prompt and Ethiopic-script detection | `am` when Ethiopic dominates | Needs real-recording WER/CER testing |
| Afaan Oromo (`om`) | Not explicitly supported in prompt or types | likely `en` because Latin script | Not verified |
| Somali (`so`) | Not explicitly supported in prompt or types | likely `en` because Latin script | Not verified |
| English (`en`) | Supported by prompt and Latin-script fallback | `en` | Needs regression testing |

### STT Testing Without Architecture Change

Do not integrate Ethio-ASR yet. Test the existing `GeminiChatSTT` path through one of these:

1. API-level test against `POST /api/v1/voice/transcribe`.
2. Service-level test against `VoiceService.transcribe(...)`.
3. Manual browser test through the dictation button.

Recommended fixture set:

- 20 Amharic clips.
- 20 Afaan Oromo clips.
- 20 Somali clips.
- 10 English clips.
- Include quiet room, laptop mic, phone mic, and light background noise.
- Include key business terms:
  - Inkomoko
  - loan
  - training
  - market
  - inventory
  - revenue
  - profit
  - repayment
  - advisor

Metrics:

- Amharic: CER plus key-term accuracy.
- Afaan Oromo and Somali: WER plus key-term accuracy.
- Empty/silence handling.
- Latency.
- Whether the model transcribes instead of translating.
- Whether the model preserves the spoken language.

Prompt experiments that preserve architecture:

- Extend the transcription prompt to mention Amharic, Afaan Oromo, Somali, and English.
- Add vocabulary entries in all target languages.
- Add optional user-selected language hint later, for example `language_hint = "am" | "om" | "so" | "en"`.
- Keep provider and endpoint structure unchanged.

## 3. TTS Architecture Proposal

### Existing Provider-Independent Interface

The app already has a provider-independent TTS interface:

```python
class TTSPort(Protocol):
    model: str
    voice: str
    audio_format: str
    content_type: str

    async def synthesize(self, text: str, lang: str) -> bytes: ...
```

This is good enough for current `/voice/speak` and live talk. For multilingual MVP, evolve it carefully rather than replacing it.

Recommended typed request model:

```python
SupportedVoiceLang = Literal["am", "om", "so", "en"]
```

Recommended future TTS port shape:

```python
class TTSPort(Protocol):
    provider: str
    model: str
    voice: str
    audio_format: str
    content_type: str

    async def synthesize(self, text: str, lang: SupportedVoiceLang, *, voice: str | None = None) -> bytes: ...

    def supports(self, lang: SupportedVoiceLang) -> bool: ...
```

The `supports(...)` method avoids pretending every provider supports every MVP language.

### Proposed Endpoint

Add later:

`POST /api/v1/voice/synthesize`

Purpose: synthesize arbitrary assistant text, not necessarily a persisted message.

Request:

```json
{
  "text": "string",
  "lang": "am | om | so | en",
  "voice": "string | null",
  "format": "wav",
  "cache": true,
  "message_id": "uuid | null"
}
```

Response option A, simplest MVP:

- `200 audio/wav`
- headers:
  - `Cache-Control: private, max-age=86400`
  - `X-TTS-Provider`
  - `X-TTS-Model`
  - `X-TTS-Voice`

Response option B, better for mobile/WhatsApp/Telegram later:

```json
{
  "audio_url": "/api/v1/voice/audio/{audio_id}",
  "content_type": "audio/wav",
  "duration_ms": 12345,
  "provider": "openrouter",
  "model": "google/gemini-3.8-flash-lite-tts",
  "voice": "Kore",
  "expires_at": "datetime"
}
```

For the web MVP, option A is enough and matches existing `POST /voice/speak`. For future external channels, option B is cleaner because WhatsApp and Telegram workers can fetch or attach audio by reference.

### Relationship to Existing `/voice/speak`

Keep `/voice/speak`.

It is session-safe and message-oriented:

- input is `message_id`
- validates the message belongs to the current session
- caches by `tts/{message_id}.wav`
- is already used by the frontend Listen button

Add `/voice/synthesize` only when the app needs text-level synthesis outside persisted assistant messages, previews, or future channel workers.

## 4. Recommended TTS Provider Candidates

Provider claims must be verified against official/provider docs before production use. Initial source notes:

- OpenAI text-to-speech docs: [OpenAI audio speech guide](https://platform.openai.com/docs/guides/text-to-speech)
- Google Cloud Text-to-Speech voices/languages: [Google Cloud supported voices and languages](https://cloud.google.com/text-to-speech/docs/voices)
- Azure Speech language support: [Azure AI Speech language and voice support](https://learn.microsoft.com/azure/ai-services/speech-service/language-support)
- ElevenLabs languages: [ElevenLabs help center language support](https://help.elevenlabs.io/)
- OpenRouter audio speech API/model availability should be verified in OpenRouter model/API docs and by test requests before relying on language support.

### Candidate A: Existing OpenRouter Gemini TTS

Current implementation:

- `OpenRouterTTS`
- model from `TTS_MODEL`
- default `google/gemini-3.8-flash-lite-tts`
- voice from `TTS_VOICE`
- no extra SDK dependency
- returns PCM, wrapped into WAV

Pros:

- Already integrated.
- Already used by read-aloud and live talk.
- One OpenRouter account/key already powers chat, embeddings, rerank, STT, and TTS.
- Minimal infrastructure change.

Risks:

- The code currently assumes `am` or English only.
- Afaan Oromo and Somali support is not verified.
- Need real synthesis tests for Amharic, Afaan Oromo, and Somali before claiming support.
- OpenRouter model availability and pricing can change.

Best use:

- First provider to test because it is already wired and low-effort.

### Candidate B: Google Cloud Text-to-Speech

Pros:

- Mature cloud TTS service.
- Clear official voice/language list.
- Operationally stable.

Risks:

- Requires Google Cloud project, credentials, SDK or REST integration, billing, and deployment secret management.
- Language support for Amharic, Afaan Oromo, and Somali must be verified from the official voice list at implementation time.
- If a language is not listed with a voice, do not assume support.

Best use:

- Good candidate if official voices cover the required languages with acceptable quality.

### Candidate C: Azure AI Speech

Pros:

- Mature speech platform.
- Official language/voice matrix.
- Can support enterprise controls.

Risks:

- Requires Azure account, region selection, credentials, SDK or REST integration, billing, and secret management.
- Language support for Amharic, Afaan Oromo, and Somali must be verified from the official language support table.
- Regional availability can differ by voice.

Best use:

- Good fallback if Azure has stronger verified voices for the target languages.

### Candidate D: ElevenLabs

Pros:

- Often strong naturalness for supported languages.
- Simple API integration via `httpx`.

Risks:

- Must verify target-language support and quality.
- Commercial licensing and data usage terms require review.
- May not support all target languages or may support them with uneven pronunciation quality.

Best use:

- Good candidate for quality comparison if language support is verified and licensing fits.

### Candidate E: Local/Open-Source TTS

Examples to investigate later:

- Coqui-style TTS forks
- MMS/VITS-family models
- Language-specific community models

Pros:

- Potential offline operation.
- More control over data.

Risks:

- Quality and language coverage vary heavily.
- Running TTS locally adds CPU/GPU and container complexity.
- Commercial licensing may be unclear for some models.
- Apple MPS support inside Docker is not straightforward.

Best use:

- Later research path, not first MVP path.

## 5. Required Backend Changes

Do not implement yet. Proposed backend work:

1. Expand shared language type.

   Add:

   ```python
   SupportedLang = Literal["am", "om", "so", "en"]
   ```

   Update DB constraints, Pydantic schemas, frontend types, analytics, and prompts together.

2. Add explicit language hints for voice.

   For dictation:

   - extend `POST /voice/transcribe` with optional form field `language_hint`
   - allowed values: `am`, `om`, `so`, `en`
   - keep optional to preserve current behavior

3. Update transcription prompt.

   Include Amharic, Afaan Oromo, Somali, and English. Require transcription, not translation.

4. Add provider support discovery.

   Add `TTSPort.supports(lang)` or equivalent capability metadata.

5. Keep `/voice/speak`.

   It already supports message-level read-aloud and caching.

6. Add `/voice/synthesize` after provider tests.

   Return `audio/wav` for web MVP, with option to later return stored audio references.

7. Store TTS metadata.

   Existing `message_audio` is message-scoped. For `/voice/synthesize`, either:

   - reuse `message_audio` when `message_id` is provided, or
   - add `tts_audio` table for arbitrary synthesized text.

8. Add provider config.

   Suggested future settings:

   ```env
   TTS_PROVIDER=openrouter
   TTS_MODEL=google/gemini-3.8-flash-lite-tts
   TTS_VOICE=Kore
   TTS_FALLBACK_PROVIDER=
   TTS_ALLOWED_LANGS=am,om,so,en
   ```

9. Add failure behavior.

   If provider does not support a language, return a typed error:

   ```json
   {
     "code": "unsupported_tts_language",
     "message": "Audio playback is not available for this language yet."
   }
   ```

   Text chat must continue to work.

## 6. Required Frontend Changes

Existing Listen support is already present:

- `MessageActions` shows read-aloud button for assistant messages.
- `useReadAloud` calls `speakMessage`.
- `clip-player.ts` supports play/stop for one clip at a time.

Required changes for multilingual MVP:

1. Keep current Listen button behavior.

   It already satisfies:

   - user asks by text or voice
   - RAG generates a response
   - user clicks read-aloud/listen
   - audio generates and plays
   - user can stop playback

2. Add pause/replay only if needed.

   Current UX is toggle play/stop. Pause and replay would require enhancing `clip-player.ts` to retain the object URL/audio element after pause instead of revoking immediately.

3. Disable gracefully.

   If TTS is unavailable for `om` or `so`, hide or disable Listen for that language with tooltip copy. Do not break text answers.

4. Add language picker or voice language hint.

   Because Oromo and Somali use Latin script, voice input needs a user-selectable language hint. This can live near the mic button or in chat settings.

5. Extend frontend types.

   Update:

   ```ts
   export type Lang = "am" | "om" | "so" | "en";
   ```

   Only after backend and DB support are updated.

6. Localize voice UI.

   Existing UI message files are English and Amharic only. Add Oromo and Somali UI strings if those languages are exposed in the interface.

## 7. Model and Provider Configuration

Current configuration:

```env
LLM_MODEL=google/gemini-3.5-flash-lite
TTS_MODEL=google/gemini-3.8-flash-lite-tts
TTS_VOICE=Kore
STT_PROMPT_LANG=am
STT_VOCABULARY=ኢንኮሞኮ=Inkomoko
```

Recommended MVP additions later:

```env
SUPPORTED_LANGS=am,om,so,en
VOICE_INPUT_LANGS=am,om,so,en
VOICE_OUTPUT_LANGS=am,om,so,en
STT_PROVIDER=openrouter-gemini-chat
TTS_PROVIDER=openrouter
TTS_ALLOWED_LANGS=am,en
```

Do not include `om` or `so` in `TTS_ALLOWED_LANGS` until provider tests show usable output.

## 8. Expected Infrastructure Requirements

Current infrastructure already supports the voice MVP baseline:

- FastAPI API container.
- OpenRouter network access.
- MinIO for cached TTS audio.
- PostgreSQL for `message_audio`.
- Browser microphone access.
- HTTPS or localhost for browser microphone permissions.

Additional needs for provider alternatives:

- Google Cloud TTS:
  - Google Cloud project
  - service account or API key
  - billing
  - SDK or REST integration

- Azure Speech:
  - Azure Speech resource
  - region-specific endpoint
  - API key
  - billing
  - SDK or REST integration

- ElevenLabs:
  - ElevenLabs account
  - API key
  - billing
  - voice/language configuration

- Local TTS:
  - model storage
  - CPU/GPU capacity
  - cold-start planning
  - licensing review
  - Docker image size management

## 9. Commercial Licensing Considerations

Before production:

- Review OpenRouter terms and the underlying model/provider terms.
- Review whether submitted text/audio can be retained or used for provider training.
- Review whether the app may send beneficiary or business-sensitive content to external speech providers.
- Confirm commercial use rights for each TTS model.
- Confirm geographic/data-transfer constraints for Inkomoko deployment countries.
- Confirm whether synthesized voices are licensed for public product use.
- For local/open-source TTS, verify model license, dataset license, and commercial use rights separately.

Do not assume Hugging Face model availability implies production commercial permission.

## 10. Testing Strategy

### STT

Use current Gemini/OpenRouter STT first.

Test languages:

- Amharic
- Afaan Oromo
- Somali
- English regression

Test process:

1. Create reference transcript fixtures.
2. Record real audio clips from target speakers.
3. Run through `/voice/transcribe`.
4. Calculate CER/WER/key-term accuracy.
5. Record latency and failures.
6. Compare prompt variants without changing architecture.

### TTS

For each candidate provider and language:

1. Synthesize 20 short assistant answers.
2. Include business terms, numbers, names, and mixed-language terms.
3. Native or fluent speakers rate:
   - intelligibility
   - pronunciation
   - naturalness
   - business-term accuracy
   - acceptability for user-facing MVP
4. Verify audio format and playback in:
   - Chrome
   - Safari
   - mobile browser if available
5. Measure:
   - first audio latency
   - total synthesis latency
   - error rate
   - cost per minute or per character

Do not mark a language as supported until it passes listening tests with real content.

### Frontend Regression

- Text chat still works when TTS fails.
- Listen button disabled or errors gracefully for unsupported languages.
- Stop playback works.
- Starting a new clip stops the previous clip.
- Dictation still inserts text into composer.
- Live talk still handles barge-in.

## 11. Implementation Tasks in Priority Order

1. Create an STT/TTS fixture test plan and sample manifest for `am`, `om`, `so`, and `en`.
2. Test current OpenRouter/Gemini STT with real recordings; do not change provider.
3. Test current OpenRouter/Gemini TTS manually for Amharic and Afaan Oromo using short approved assistant answers.
4. Add explicit provider capability metadata in code design, but do not enable unsupported languages.
5. Expand language types and DB constraints to `am | om | so | en`.
6. Add optional `language_hint` to dictation/live voice flows.
7. Update STT prompt to mention Amharic, Afaan Oromo, Somali, and English.
8. Add `/voice/synthesize` using the existing `TTSPort` only after provider testing.
9. Add provider fallback only after at least two providers are tested.
10. Add UI language hint selector and unsupported-TTS messaging.
11. Add pause/replay enhancements to frontend playback if required by usability testing.

## Recommendation: First TTS Provider to Test

Test the existing OpenRouter Gemini TTS path first, specifically the currently configured `google/gemini-3.8-flash-lite-tts`, because it is already integrated behind `TTSPort`, already used by `/voice/speak` and live talk, requires no new SDK, no new infrastructure, and is the fastest way to discover whether Amharic and Afaan Oromo output are usable.

This is a test recommendation, not a support claim. Amharic and Afaan Oromo TTS quality and support must be verified with real synthesis samples and native-speaker review before enabling them as production-supported languages.
