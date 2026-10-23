"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiBlob } from "@/lib/api";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { voiceFailureMessage } from "../error-message";
import { useVoiceCapabilities } from "../hooks/use-voice-capabilities";

export function ListenButton({ text, language: requestedLanguage, label = "Listen" }: { text: string; language: string; label?: string }) {
  const t = useTranslations("voice");
  const { locale } = useLocaleSwitch();
  // Synthesize in the language of the displayed text; UI locale alone is not source metadata.
  const language = requestedLanguage || locale;
  const capabilities = useVoiceCapabilities();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [playbackError, setPlaybackError] = useState<unknown>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  async function listen() {
    const audio = audioRef.current;
    if (state === "playing" && audio) {
      audio.pause();
      audio.currentTime = 0;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      audioRef.current = null;
      setState("idle");
      return;
    }
    setState("loading");
    setPlaybackError(null);
    try {
      const blob = await apiBlob("/voice/speak-text", { method: "POST", body: { text, language, context: "dashboard" } });
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const next = new Audio(objectUrl);
      const cleanUp = () => {
        if (objectUrlRef.current === objectUrl) URL.revokeObjectURL(objectUrl);
        if (audioRef.current === next) audioRef.current = null;
      };
      next.onended = () => { cleanUp(); setState("idle"); };
      next.onerror = () => {
        cleanUp();
        setPlaybackError(new Error("Audio playback unavailable"));
        setState("error");
      };
      audioRef.current = next;
      await next.play();
      setState("playing");
    } catch (error) {
      audioRef.current?.pause();
      audioRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setPlaybackError(error);
      setState("error");
    }
  }
  if (!capabilities.canSpeak(language) || !text.trim()) return null;
  const errorText = state === "error" ? voiceFailureMessage(playbackError, language, t) : null;
  return <div className="flex flex-wrap items-center gap-2">{state === "error" && <p role="status" className="text-sm text-text-secondary">{errorText}</p>}<Button type="button" variant="outline" className="h-10 bg-background" onClick={() => void listen()} aria-label={state === "playing" ? t("stopPlayback") : label} disabled={state === "loading"}>{state === "loading" ? <LoaderCircle className="animate-spin" /> : <Volume2 />} {state === "error" ? t("listen") : state === "playing" ? t("stopPlayback") : label}</Button></div>;
}
