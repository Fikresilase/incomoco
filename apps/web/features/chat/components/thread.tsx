"use client";

import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AssistantMessage, UserMessage } from "./message-item";
import type { UIMessage } from "../types";

export interface ThreadProps {
  messages: UIMessage[];
  streaming: boolean;
  onRegenerate: () => void;
  onRetry: (message: UIMessage) => void;
  readAloud: {
    playingId: string | null;
    loadingId: string | null;
    toggle: (id: string) => void;
  };
}

/** Scrollable message list that sticks to the bottom while an answer streams. */
export function Thread({ messages, streaming, onRegenerate, onRetry, readAloud }: ThreadProps) {
  const t = useTranslations("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 80;
    setShowJump(distance > 240);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastAssistantIndex = messages.findLastIndex((m) => m.role === "assistant");

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin h-full overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-6 pb-10 sm:px-6">
          {messages.map((message, i) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                isLast={i === lastAssistantIndex}
                canRegenerate={i === lastAssistantIndex && !streaming && !message.retry}
                onRegenerate={onRegenerate}
                onRetry={onRetry}
                readAloud={{
                  playing: readAloud.playingId === message.id,
                  loading: readAloud.loadingId === message.id,
                  toggle: () => readAloud.toggle(message.id),
                }}
              />
            )
          )}
        </div>
      </div>
      {showJump && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={jumpToBottom}
          aria-label={t("scrollToBottom")}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
        >
          <ArrowDown />
        </Button>
      )}
    </div>
  );
}
