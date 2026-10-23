"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { currentClipKey, playClip, stopClip, subscribeClip } from "@/lib/audio/clip-player";
import { voiceFailureMessage } from "@/features/voice/error-message";
import { useVoiceCapabilities } from "@/features/voice/hooks/use-voice-capabilities";
import { speakMessage } from "../api";

/** Read an assistant message aloud (`POST /voice/speak`); one clip at a time, toggle to stop. */
export function useReadAloud(activeLanguage: string) {
  const t = useTranslations("voice");
  const capabilities = useVoiceCapabilities();
  const canSpeak = capabilities.canSpeak;
  const playingId = useSyncExternalStore(subscribeClip, currentClipKey, () => null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (canSpeak(activeLanguage)) return;
    requestRef.current++;
    stopClip();
    const reset = window.setTimeout(() => setLoadingId(null), 0);
    return () => window.clearTimeout(reset);
  }, [activeLanguage, canSpeak]);

  const toggle = useCallback(
    async (messageId: string, language: string | null | undefined) => {
      if (!canSpeak(activeLanguage) || !canSpeak(language)) return;
      if (playingId === messageId || loadingId === messageId) {
        requestRef.current++;
        setLoadingId(null);
        stopClip();
        return;
      }
      const request = ++requestRef.current;
      stopClip();
      setLoadingId(messageId);
      try {
        const blob = await speakMessage(messageId);
        if (request !== requestRef.current) return;
        setLoadingId(null);
        await playClip(messageId, blob);
      } catch (err) {
        if (request !== requestRef.current) return;
        setLoadingId(null);
        toast.error(voiceFailureMessage(err, language ?? "", t));
      }
    },
    [activeLanguage, canSpeak, loadingId, playingId, t]
  );

  return {
    playingId,
    loadingId,
    toggle,
    canSpeak: (language: string | null | undefined) =>
      canSpeak(activeLanguage) && canSpeak(language),
  };
}
