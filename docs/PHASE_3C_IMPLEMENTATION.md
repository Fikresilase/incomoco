# Phase 3C: Conversational Welcome

## Architecture

The root route now opens `/welcome`, a lightweight adviser entry surface. Existing `/home`, `/learn`, `/my-business`, and `/chat` routes remain unchanged. The welcome screen reads the server-resolved dashboard profile and reuses the existing `useDictation` hook, `/voice/transcribe`, `/voice/speak-text`, TTS cache, and chat entry route.

## Interaction states

The screen exposes Ready, Listening, Processing, Speaking, and Error states through visible status text and a subtle microphone ring. Push-to-talk is the supported voice mode: the user taps the microphone to begin and taps again to stop. Continuous hands-free listening is intentionally not enabled until interruption and permission behavior can be validated safely.

Mute stops automatic welcome playback and prevents automatic speech while the screen is muted. Text remains visible and the Type instead path remains available at all times. Welcome speech is guarded by component/session state so it does not replay on ordinary rerenders.

## Language and continuity

Amharic uses the existing preferred-language value and the same `am` TTS route as dashboard speech. No language detection is added to the welcome surface. The dashboard action is used as a short continuity cue when available; otherwise the generic welcome prompt is shown. The transcript is handed to the existing chat path rather than a second adviser or RAG pipeline.

## Known limitations

The current pass does not add a new structured response envelope or duplicate the chat orchestration. The transcript preview links into the existing chat screen; lesson/action/handoff routing continues to be owned by the existing screens and services. Hands-free mode and automated browser microphone tests remain future work.

## Verification

- Backend: `45 passed, 4 skipped`
- Ruff: passed
- Frontend typecheck: passed
- Frontend lint: passed with existing vendored VAD warnings only
- Production build: passed
