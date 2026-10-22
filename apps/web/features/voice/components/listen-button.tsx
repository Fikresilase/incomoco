"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiBlob } from "@/lib/api";

export function ListenButton({ text, language, label = "Listen" }: { text: string; language: string; label?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  async function listen() {
    const audio = audioRef.current;
    if (state === "playing" && audio) {
      audio.pause();
      audio.currentTime = 0;
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const blob = await apiBlob("/voice/speak-text", { method: "POST", body: { text, language, context: "dashboard" } });
      const next = new Audio(URL.createObjectURL(blob));
      next.onended = () => setState("idle");
      audioRef.current = next;
      await next.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }
  return <Button type="button" variant="outline" className="h-10 bg-background" onClick={() => void listen()} aria-label={state === "error" ? "Voice is temporarily unavailable" : label} disabled={state === "loading"}>{state === "loading" ? <LoaderCircle className="animate-spin" /> : <Volume2 />} {state === "error" ? "Voice is temporarily unavailable" : state === "playing" ? "Stop" : label}</Button>;
}
