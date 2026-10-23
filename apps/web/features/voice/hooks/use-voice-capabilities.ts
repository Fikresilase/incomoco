"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type VoiceLanguage = "am" | "om" | "so" | "en";
type VoiceCapabilities = { supported_languages: VoiceLanguage[] };

export function useVoiceCapabilities() {
  const query = useQuery({
    queryKey: ["voice-capabilities"],
    queryFn: () => apiFetch<VoiceCapabilities>("/voice/capabilities"),
    staleTime: 60_000,
    retry: 1,
  });

  const canSpeak = useCallback(
    (language: string | null | undefined) =>
      !!language && query.data?.supported_languages.includes(language as VoiceLanguage) === true,
    [query.data?.supported_languages],
  );

  return { ...query, canSpeak };
}
