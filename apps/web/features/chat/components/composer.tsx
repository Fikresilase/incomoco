"use client";

import { ArrowUp, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MAX_MESSAGE_LENGTH } from "../hooks/use-chat";

export interface ComposerHandle {
  focus: () => void;
}

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  /** Extra controls (dictation, live talk) composed in by the route. */
  tools?: ReactNode;
}

const MAX_HEIGHT = 200;

/** Auto-growing input: Enter sends, Shift+Enter inserts a newline. */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSubmit, onStop, streaming, disabled, tools },
  ref
) {
  const t = useTranslations("chat");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    },
  }));

  // Resize to content (fallback for browsers without `field-sizing: content`).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const length = value.trim().length;
  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  const canSend = length > 0 && !tooLong && !streaming && !disabled;

  return (
    <form
      className="relative rounded-[1.75rem] border border-border bg-background p-2 shadow-[0_2px_12px_rgba(0,32,95,0.06)] transition-shadow focus-within:border-secondary/30 focus-within:shadow-[0_2px_16px_rgba(0,32,95,0.10)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        {t("inputLabel")}
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Respect IME composition (e.g. Amharic keyboards) before treating Enter as send.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        placeholder={t("inputPlaceholder")}
        aria-describedby="chat-input-hint"
        aria-invalid={tooLong || undefined}
        className="block max-h-[200px] min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
      />
      <p id="chat-input-hint" className="sr-only">
        {t("inputHint")}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">{tools}</div>
        <div className="flex items-center gap-2">
          {value.length > MAX_MESSAGE_LENGTH * 0.9 && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                tooLong ? "text-destructive" : "text-muted-foreground"
              )}
              aria-live="polite"
            >
              {tooLong
                ? t("tooLong", { count: value.length, max: MAX_MESSAGE_LENGTH })
                : `${value.length}/${MAX_MESSAGE_LENGTH}`}
            </span>
          )}
          {streaming ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={onStop}
                  aria-label={t("stop")}
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("stop")}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" size="icon" disabled={!canSend} aria-label={t("send")}>
                  <ArrowUp className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("send")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </form>
  );
});
