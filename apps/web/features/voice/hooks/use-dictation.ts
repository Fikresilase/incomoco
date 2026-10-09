"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MicPermissionError,
  MicUnavailableError,
  startRecorder,
  type Recorder,
} from "@/lib/audio/recorder";
import { errorMessage } from "@/lib/format";
import { transcribe } from "../api";

export const MAX_DICTATION_MS = 60_000;
const MIN_DICTATION_MS = 400;

export type DictationState = "idle" | "starting" | "recording" | "transcribing";

/**
 * Tap to record, tap to stop. On stop the audio is encoded as 16 kHz mono WAV,
 * sent to `POST /voice/transcribe`, and the text is handed to `onText` (never auto-sent).
 */
export function useDictation(onText: (text: string) => void, conversationId?: string | null) {
  const t = useTranslations("voice");
  const conversationRef = useRef(conversationId);
  useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef<() => void>(() => undefined);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    clearTimer();
    setState("transcribing");
    try {
      const { wav, durationMs } = await recorder.stop();
      if (durationMs < MIN_DICTATION_MS) {
        toast.info(t("tooShort"));
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const { text } = await transcribe(wav, {
        conversationId: conversationRef.current,
        signal: controller.signal,
      });
      if (text.trim()) onText(text);
      else toast.info(t("emptyTranscript"));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error(errorMessage(err, t("transcribeError")));
      }
    } finally {
      abortRef.current = null;
      setState("idle");
      setElapsedMs(0);
    }
  }, [onText, t]);

  useEffect(() => {
    stopRef.current = () => void stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setState("starting");
    try {
      const recorder = await startRecorder();
      recorderRef.current = recorder;
      const startedAt = performance.now();
      setElapsedMs(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        const elapsed = performance.now() - startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DICTATION_MS) stopRef.current();
      }, 200);
    } catch (err) {
      setState("idle");
      if (err instanceof MicPermissionError) toast.error(t("micDenied"));
      else if (err instanceof MicUnavailableError) toast.error(t("micUnavailable"));
      else toast.error(errorMessage(err, t("micUnavailable")));
    }
  }, [t]);

  const cancel = useCallback(() => {
    clearTimer();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    abortRef.current?.abort();
    setState("idle");
    setElapsedMs(0);
  }, []);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(
    () => () => {
      clearTimer();
      recorderRef.current?.cancel();
      abortRef.current?.abort();
    },
    []
  );

  const getLevel = useCallback(() => recorderRef.current?.level() ?? 0, []);

  return { state, elapsedMs, start, stop, cancel, getLevel };
}
