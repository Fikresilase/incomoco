import { apiFetch, type TranscribeResponse } from "@/lib/api";
import { WS_BASE } from "@/lib/env";

/** `POST /voice/transcribe`: multipart field `audio` with a 16 kHz mono PCM16 WAV (≤ 60 s). */
export function transcribe(
  wav: Blob,
  { conversationId, signal }: { conversationId?: string | null; signal?: AbortSignal } = {}
) {
  const form = new FormData();
  form.append("audio", wav, "dictation.wav");
  // Recent turns of this conversation help the transcriber resolve unclear words.
  if (conversationId) form.append("conversation_id", conversationId);
  return apiFetch<TranscribeResponse>("/voice/transcribe", {
    method: "POST",
    body: form,
    signal,
  });
}

/** `WS /voice/live` URL (the session cookie is sent automatically). */
export const LIVE_TALK_URL = `${WS_BASE}/voice/live`;
