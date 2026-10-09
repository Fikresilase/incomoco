"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { streamChat, isApiError } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { chatKeys, getConversation } from "../api";
import { LOCAL_ID_PREFIX, fromServer, type UIMessage } from "../types";

export const MAX_MESSAGE_LENGTH = 4000;

function localId(kind: "u" | "a") {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${LOCAL_ID_PREFIX}${kind}-${rand}`;
}

function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(window.history.state, "", url);
}

interface SendOptions {
  text: string;
  modality: "text" | "dictation";
}

/**
 * Chat state for one thread.
 *
 * Rendered messages = server messages (TanStack Query) merged with local "pending"
 * messages that are streaming or not yet persisted. Streaming items win over their
 * server copy; once streaming ends the server copy (same id) replaces them.
 */
export function useChat() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    searchParams.get("c")
  );
  const [pending, setPending] = useState<UIMessage[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const conversationQuery = useQuery({
    queryKey: chatKeys.conversation(conversationId),
    queryFn: () => getConversation(conversationId as string),
    enabled: Boolean(conversationId) && !streaming,
  });

  const messages = useMemo<UIMessage[]>(() => {
    const server = conversationQuery.data?.messages ?? [];
    const serverIds = new Set(server.map((m) => m.id));
    const streamingIds = new Set(pending.filter((m) => m.streaming).map((m) => m.id));
    const merged: UIMessage[] = server
      .filter((m) => !hidden.has(m.id) && !streamingIds.has(m.id))
      .map(fromServer);
    for (const m of pending) {
      if (hidden.has(m.id)) continue;
      if (m.streaming || !serverIds.has(m.id)) merged.push(m);
    }
    return merged;
  }, [conversationQuery.data, pending, hidden]);

  const patch = useCallback(
    (id: string, update: Partial<UIMessage> | ((m: UIMessage) => Partial<UIMessage>)) => {
      setPending((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, ...(typeof update === "function" ? update(m) : update) } : m
        )
      );
    },
    []
  );

  const run = useCallback(
    async ({ text, modality }: SendOptions, regenerate: boolean) => {
      if (abortRef.current) return;
      const startConversation = conversationId;
      const now = new Date().toISOString();
      let userId = localId("u");
      let assistantId = localId("a");

      const placeholder: UIMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        lang: null,
        modality: "text",
        status: "complete",
        no_answer: false,
        sources: [],
        feedback: null,
        has_audio: false,
        created_at: now,
        streaming: true,
        error: null,
      };
      setPending((prev) => [
        ...prev,
        ...(regenerate
          ? []
          : [
              {
                ...placeholder,
                id: userId,
                role: "user" as const,
                content: text,
                modality,
                streaming: false,
              },
            ]),
        placeholder,
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      let convId = startConversation;
      let started = false;
      // Batch token deltas to one state update per animation frame.
      let buffered = "";
      let frame: number | null = null;
      const flush = () => {
        frame = null;
        if (!buffered) return;
        const chunk = buffered;
        buffered = "";
        patch(assistantId, (m) => ({ content: m.content + chunk }));
      };
      const rename = (from: string, to: string) => {
        if (from === to) return;
        setPending((prev) => prev.map((m) => (m.id === from ? { ...m, id: to } : m)));
      };

      try {
        const stream = streamChat(
          {
            message: text,
            conversation_id: startConversation,
            modality,
            regenerate,
          },
          controller.signal
        );
        for await (const ev of stream) {
          if (ev.event === "start") {
            started = true;
            convId = ev.data.conversation_id;
            if (convId !== startConversation) {
              setConversationId(convId);
              syncUrl(convId);
            }
            if (!regenerate) {
              rename(userId, ev.data.user_message_id);
              userId = ev.data.user_message_id;
            }
            rename(assistantId, ev.data.assistant_message_id);
            assistantId = ev.data.assistant_message_id;
            patch(assistantId, { lang: ev.data.lang });
            if (!regenerate) patch(userId, { lang: ev.data.lang });
          } else if (ev.event === "sources") {
            patch(assistantId, { sources: ev.data.sources });
          } else if (ev.event === "delta") {
            buffered += ev.data.text;
            if (frame === null) frame = requestAnimationFrame(flush);
          } else if (ev.event === "done") {
            if (frame !== null) cancelAnimationFrame(frame);
            flush();
            rename(assistantId, ev.data.assistant_message_id);
            assistantId = ev.data.assistant_message_id;
            patch(assistantId, {
              no_answer: ev.data.no_answer,
              streaming: false,
              status: "complete",
            });
          } else if (ev.event === "error") {
            if (frame !== null) cancelAnimationFrame(frame);
            flush();
            patch(assistantId, {
              streaming: false,
              status: "error",
              error: ev.data.message || t("chat.answerError"),
            });
          }
        }
        if (frame !== null) cancelAnimationFrame(frame);
        flush();
        patch(assistantId, (m) => (m.streaming ? { streaming: false } : {}));
      } catch (err) {
        if (frame !== null) cancelAnimationFrame(frame);
        flush();
        const aborted = err instanceof DOMException && err.name === "AbortError";
        patch(
          assistantId,
          aborted
            ? { streaming: false, status: "interrupted" }
            : {
                streaming: false,
                status: "error",
                error: errorMessage(err, t("chat.answerError"), t("common.networkError")),
                retry: started ? undefined : { text, modality },
              }
        );
      } finally {
        abortRef.current = null;
        setStreaming(false);
        if (convId) {
          void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(convId) });
        }
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
      }
    },
    [conversationId, patch, queryClient, t]
  );

  const send = useCallback(
    (text: string, modality: "text" | "dictation" = "text") => {
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;
      void run({ text: trimmed, modality }, false);
    },
    [run]
  );

  /** Re-answer the last user message (server deletes the last assistant message). */
  const regenerate = useCallback(() => {
    if (!conversationId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    if (lastAssistant) {
      setHidden((prev) => new Set(prev).add(lastAssistant.id));
    }
    const modality = lastUser.modality === "dictation" ? "dictation" : "text";
    // `message` is ignored with regenerate: true, but we send the last question to satisfy validation.
    void run({ text: lastUser.content || ".", modality }, true);
  }, [conversationId, messages, run]);

  /** Retry a message whose request failed before the server accepted it. */
  const retry = useCallback(
    (failed: UIMessage) => {
      if (!failed.retry) return;
      const { text, modality } = failed.retry;
      setPending((prev) => {
        const idx = prev.findIndex((m) => m.id === failed.id);
        if (idx === -1) return prev;
        // Drop the failed assistant placeholder and its local user message.
        const userIdx = idx - 1;
        return prev.filter(
          (_, i) => i !== idx && !(i === userIdx && prev[i].id.startsWith(LOCAL_ID_PREFIX))
        );
      });
      void run({ text, modality }, false);
    },
    [run]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const selectConversation = useCallback((id: string | null) => {
    abortRef.current?.abort();
    setPending([]);
    setHidden(new Set());
    setConversationId(id);
    syncUrl(id);
  }, []);

  /** Called after live talk: show the voice turns as normal messages. */
  const refreshAfterVoice = useCallback(
    (id: string | null) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
      if (!id) return;
      if (id !== conversationId) selectConversation(id);
      else void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(id) });
    },
    [conversationId, queryClient, selectConversation]
  );

  const notFound = isApiError(conversationQuery.error, 404);

  return {
    conversationId,
    messages,
    streaming,
    isLoading: Boolean(conversationId) && conversationQuery.isPending && pending.length === 0,
    loadError: conversationQuery.isError && pending.length === 0 ? conversationQuery.error : null,
    notFound,
    reload: () => void conversationQuery.refetch(),
    send,
    regenerate,
    retry,
    stop,
    selectConversation,
    refreshAfterVoice,
  };
}
