"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ComponentType,
  type ReactNode,
} from "react";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { useChat } from "../hooks/use-chat";
import { useReadAloud } from "../hooks/use-read-aloud";
import { useChatNavigation } from "@/features/work/app-shell";
import type { ComposerToolsContext } from "../types";
import { Composer, type ComposerHandle } from "./composer";
import { EmptyState } from "./empty-state";
import { Thread } from "./thread";

export interface ChatAppProps {
  /** Extra composer controls (dictation, live talk), composed in by the route. */
  ComposerTools?: ComponentType<{ ctx: ComposerToolsContext }>;
}

function ThreadSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-8 sm:px-6"
      aria-busy="true"
    >
      <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
    </div>
  );
}

export function ChatApp({ ComposerTools }: ChatAppProps) {
  const t = useTranslations();
  const chat = useChat();
  const online = useOnlineStatus();
  const { locale } = useLocaleSwitch();
  const readAloud = useReadAloud(locale);
  const composerRef = useRef<ComposerHandle>(null);

  const [input, setInput] = useState("");
  const [fromDictation, setFromDictation] = useState(false);
  const navigationRef = useChatNavigation();

  const { selectConversation, send, refreshAfterVoice, conversationId } = chat;

  useEffect(() => {
    const welcomeMessage = sessionStorage.getItem("inkomoko_welcome_message");
    if (!welcomeMessage?.trim()) return;
    sessionStorage.removeItem("inkomoko_welcome_message");
    send(welcomeMessage, "text", locale);
  }, [locale, send]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!value.trim()) setFromDictation(false);
  };

  const submit = () => {
    send(input, fromDictation ? "dictation" : "text", locale);
    setInput("");
    setFromDictation(false);
  };

  const newChat = useCallback(() => {
    selectConversation(null);
    setInput("");
    setFromDictation(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [selectConversation]);

  const openConversation = useCallback(
    (id: string) => {
      selectConversation(id);
    },
    [selectConversation],
  );

  const onDeleted = useCallback(
    (id: string) => {
      if (id === conversationId) newChat();
    },
    [conversationId, newChat],
  );

  const insertText = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setInput((prev) =>
      prev.trim() ? `${prev.replace(/\s+$/, "")} ${clean}` : clean,
    );
    setFromDictation(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const toolsContext = useMemo<ComposerToolsContext>(
    () => ({
      conversationId,
      disabled: chat.streaming || !online,
      lang: locale,
      insertText,
      onLiveTalkEnded: refreshAfterVoice,
    }),
    [
      conversationId,
      chat.streaming,
      online,
      insertText,
      refreshAfterVoice,
      locale,
    ],
  );

  useEffect(() => {
    if (!navigationRef) return;
    navigationRef.current = {
      newChat,
      select: openConversation,
      deleted: onDeleted,
    };
    return () => {
      navigationRef.current = null;
    };
  }, [navigationRef, newChat, openConversation, onDeleted]);

  const hasMessages = chat.messages.length > 0;
  const showEmpty = !conversationId && !hasMessages;

  let body: ReactNode;
  if (chat.isLoading) {
    body = (
      <div className="min-h-0 flex-1">
        <ThreadSkeleton />
      </div>
    );
  } else if (chat.loadError) {
    body = (
      <div className="flex flex-1 items-center justify-center px-6">
        <div role="alert" className="max-w-sm text-center">
          <AlertCircle
            className="mx-auto mb-3 size-6 text-destructive"
            aria-hidden
          />
          <p className="font-semibold text-secondary">
            {chat.notFound
              ? t("chat.conversationNotFound")
              : t("chat.loadConversationError")}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {!chat.notFound && (
              <Button variant="outline" onClick={chat.reload}>
                {t("common.retry")}
              </Button>
            )}
            <Button onClick={newChat}>{t("chat.newChat")}</Button>
          </div>
        </div>
      </div>
    );
  } else if (showEmpty) {
    body = (
      <EmptyState
        onPick={(text) => send(text, "text", locale)}
        disabled={!online}
      />
    );
  } else {
    body = (
      <Thread
        messages={chat.messages}
        streaming={chat.streaming}
        onRegenerate={chat.regenerate}
        onRetry={chat.retry}
        readAloud={readAloud}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <a
        href="#chat-input"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-secondary focus:px-4 focus:py-2 focus:text-sm focus:text-secondary-foreground"
      >
        {t("common.skipToContent")}
      </a>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <OfflineBanner />

        <main className="flex min-h-0 flex-1 flex-col" id="main">
          {body}
          <div className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6 sm:pb-3">
            <div className="mx-auto w-full max-w-3xl">
              <Composer
                ref={composerRef}
                value={input}
                onChange={handleInputChange}
                onSubmit={submit}
                onStop={chat.stop}
                streaming={chat.streaming}
                disabled={!online}
                tools={
                  ComposerTools ? <ComposerTools ctx={toolsContext} /> : null
                }
              />
              <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
                {t("chat.disclaimer")}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
