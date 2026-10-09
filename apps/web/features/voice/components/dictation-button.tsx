"use client";

import { Check, Loader2, Mic, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration } from "@/lib/format";
import { MAX_DICTATION_MS, useDictation } from "../hooks/use-dictation";
import { LevelMeter } from "./level-meter";

export interface DictationButtonProps {
  /** Receives the transcript; the caller puts it in the input box for editing. */
  onText: (text: string) => void;
  /** Current conversation, used as transcription context. */
  conversationId?: string | null;
  disabled?: boolean;
}

/**
 * Mic button for dictation. While recording, a panel covers the input box
 * (its nearest positioned ancestor) with a live waveform, timer, cancel and stop.
 */
export function DictationButton({ onText, conversationId, disabled }: DictationButtonProps) {
  const t = useTranslations("voice");
  const { state, elapsedMs, start, stop, cancel, getLevel } = useDictation(onText, conversationId);
  const active = state !== "idle";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void start()}
            disabled={disabled || active}
            aria-label={t("dictate")}
            className="text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Mic className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("dictate")}</TooltipContent>
      </Tooltip>

      {active && (
        <div
          role="group"
          aria-label={t("recording")}
          className="absolute inset-0 z-10 flex items-center gap-2 rounded-[inherit] bg-background px-2 animate-in fade-in duration-150"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={cancel}
            aria-label={t("cancelDictation")}
          >
            <X className="size-5" />
          </Button>

          {state === "transcribing" ? (
            <p
              className="flex flex-1 items-center justify-center gap-2 text-sm font-semibold text-secondary"
              role="status"
            >
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              {t("transcribing")}
            </p>
          ) : (
            <>
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              <LevelMeter getLevel={getLevel} className="h-10 min-w-0 flex-1" />
              <span
                className="w-12 shrink-0 text-right text-sm font-semibold text-secondary tabular-nums"
                aria-label={`${t("recording")} ${formatDuration(elapsedMs)}`}
                title={t("maxLength")}
              >
                {formatDuration(elapsedMs)}
              </span>
              <span className="sr-only" role="status">
                {state === "recording" ? t("recording") : ""}
              </span>
              <Button
                type="button"
                size="icon"
                onClick={() => void stop()}
                disabled={state !== "recording"}
                aria-label={t("stopDictation")}
                autoFocus
              >
                <Check className="size-5" />
              </Button>
            </>
          )}
          {state === "recording" && elapsedMs > MAX_DICTATION_MS - 10_000 && (
            <span className="sr-only" aria-live="assertive">
              {t("maxLength")}
            </span>
          )}
        </div>
      )}
    </>
  );
}
