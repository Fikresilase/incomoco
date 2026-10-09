"use client";

import { AlertCircle, Info, Mic, AudioLines, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { SHOW_SOURCES } from "../config";
import { SourceChips } from "./citations";
import { Markdown } from "./markdown";
import { MessageActions } from "./message-actions";
import type { UIMessage } from "../types";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-secondary/40"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

export const UserMessage = memo(function UserMessage({ message }: { message: UIMessage }) {
  const t = useTranslations();
  const ModalityIcon =
    message.modality === "voice" ? AudioLines : message.modality === "dictation" ? Mic : null;
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[75%]">
        <span className="sr-only">{t("chat.you")}:</span>
        <div
          lang={message.lang ?? undefined}
          className="rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]"
        >
          {message.content}
        </div>
        {ModalityIcon && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ModalityIcon className="size-3" aria-hidden />
            {message.modality === "voice" ? t("voice.liveTalk") : t("voice.dictate")}
          </span>
        )}
      </div>
    </div>
  );
});

export interface AssistantMessageProps {
  message: UIMessage;
  isLast: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onRetry: (message: UIMessage) => void;
  readAloud: { playing: boolean; loading: boolean; toggle: () => void };
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  canRegenerate,
  onRegenerate,
  onRetry,
  readAloud,
}: AssistantMessageProps) {
  const t = useTranslations();
  const empty = message.content.length === 0;
  const failed = message.status === "error";

  return (
    <article className="group/msg flex gap-3" aria-label={t("common.assistant")}>
      <div
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background"
      >
        <span className="size-2.5 rounded-full bg-primary" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div
          lang={message.lang ?? undefined}
          aria-live={message.streaming ? "polite" : undefined}
          aria-busy={message.streaming}
          aria-atomic="false"
        >
          {empty && message.streaming ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <TypingDots />
              <span className="sr-only">{t("chat.thinking")}</span>
            </span>
          ) : (
            !empty && <Markdown content={message.content} sources={message.sources} />
          )}
          {message.streaming && !empty && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 rounded-full bg-primary"
              style={{ animation: "caret-blink 1s step-end infinite" }}
            />
          )}
        </div>

        {message.no_answer && !message.streaming && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-info/60 bg-info/10 px-3 py-2 text-sm text-secondary">
            <Info className="mt-0.5 size-4 shrink-0 text-violet" aria-hidden />
            {t("chat.noAnswer")}
          </p>
        )}

        {message.status === "interrupted" && !message.streaming && (
          <p className="mt-2 text-xs font-medium text-muted-foreground">{t("chat.interrupted")}</p>
        )}

        {failed && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {message.error || t("chat.answerError")}
            </span>
            {(message.retry || canRegenerate) && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => (message.retry ? onRetry(message) : onRegenerate())}
              >
                <RotateCcw />
                {t("common.retry")}
              </Button>
            )}
          </div>
        )}

        {SHOW_SOURCES && !message.streaming && message.sources.length > 0 && (
          <SourceChips sources={message.sources} />
        )}

        {!message.streaming && !message.retry && !empty && (
          <div className="mt-2">
            <MessageActions
              message={message}
              canRegenerate={canRegenerate}
              onRegenerate={onRegenerate}
              readAloud={readAloud}
            />
          </div>
        )}
      </div>
    </article>
  );
});
