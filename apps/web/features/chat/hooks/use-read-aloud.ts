"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { currentClipKey, playClip, stopClip, subscribeClip } from "@/lib/audio/clip-player";
import { errorMessage } from "@/lib/format";
import { speakMessage } from "../api";

/** Read an assistant message aloud (`POST /voice/speak`); one clip at a time, toggle to stop. */
export function useReadAloud() {
  const t = useTranslations("chat");
  const playingId = useSyncExternalStore(subscribeClip, currentClipKey, () => null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const requestRef = useRef(0);

  const toggle = useCallback(
    async (messageId: string) => {
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
        toast.error(errorMessage(err, t("readAloudError")));
      }
    },
    [loadingId, playingId, t]
  );

  return { playingId, loadingId, toggle };
}
