"use client";

import type { MicVAD } from "@ricky0123/vad-web";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveClientMessage, LiveServerMessage } from "@/lib/api";
import { PlaybackQueue } from "@/lib/audio/playback-queue";
import { MicPermissionError, MicUnavailableError } from "@/lib/audio/recorder";
import { TARGET_SAMPLE_RATE, encodeWav } from "@/lib/audio/wav";
import { LIVE_TALK_URL } from "../api";
import { createMicVad } from "../vad";

export type LiveStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

export interface TranscriptLine {
  id: string;
  role: "user" | "agent";
  text: string;
  /** User line waiting for its transcript. */
  pending?: boolean;
  interrupted?: boolean;
  noAnswer?: boolean;
}

interface Session {
  ws: WebSocket;
  queue: PlaybackQueue;
  vad: MicVAD | null;
  conversationId: string | null;
  ready: boolean;
  closed: boolean;
  /** Utterance sent, waiting for `user.transcript` / `turn.empty`. */
  awaitingTranscript: boolean;
  /** Agent is answering (between `user.transcript` and `turn.done`). */
  agentActive: boolean;
  /** Index announced by `agent.audio`; the next binary frame carries its WAV audio. */
  pendingAudioIndex: number | null;
  agentLineId: string | null;
  seq: number;
}

/**
 * Live talk over `WS /voice/live`:
 * - Silero VAD (in the browser) detects end of speech → the utterance is sent as one WAV frame.
 * - The server streams `user.transcript`, `agent.text.delta`, and `agent.audio` (+ binary WAV),
 *   played back in index order through a PlaybackQueue.
 * - Barge-in: when the VAD hears the user while the agent is answering or speaking, playback
 *   stops immediately and `{"type":"interrupt"}` is sent.
 */
export function useLiveTalk() {
  const t = useTranslations("voice");
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  /** Latest speech probability (0..1), read by the orb animation without re-rendering. */
  const levelRef = useRef(0);

  const refreshStatus = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.closed) return;
    setStatus((prev) => {
      if (prev === "error") return prev;
      if (!s.ready || !s.vad) return "connecting";
      if (s.queue.isPlaying) return "speaking";
      if (s.awaitingTranscript || s.agentActive || s.queue.isBusy) return "thinking";
      return "listening";
    });
  }, []);

  const send = (s: Session, message: LiveClientMessage) => {
    if (s.ws.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(message));
  };

  const patchLine = (id: string, update: (line: TranscriptLine) => TranscriptLine) =>
    setLines((prev) => prev.map((l) => (l.id === id ? update(l) : l)));

  const teardown = useCallback((s: Session, sendEnd: boolean) => {
    if (s.closed) return;
    s.closed = true;
    if (sendEnd) send(s, { type: "session.end" });
    try {
      s.ws.close(1000);
    } catch {
      /* already closed */
    }
    void s.vad?.destroy();
    void s.queue.close();
    levelRef.current = 0;
  }, []);

  const bargeIn = useCallback(
    (s: Session) => {
      s.queue.stop();
      send(s, { type: "interrupt" });
      if (s.agentLineId) {
        const id = s.agentLineId;
        patchLine(id, (l) => ({ ...l, interrupted: true }));
      }
      s.agentActive = false;
      s.agentLineId = null;
      refreshStatus();
    },
    [refreshStatus]
  );

  const handleMessage = useCallback(
    (s: Session, msg: LiveServerMessage) => {
      switch (msg.type) {
        case "session.ready":
          s.conversationId = msg.conversation_id;
          s.ready = true;
          break;
        case "user.transcript": {
          s.awaitingTranscript = false;
          s.agentActive = true;
          s.queue.startTurn();
          const agentId = `agent-${++s.seq}`;
          s.agentLineId = agentId;
          setLines((prev) => {
            const idx = prev.findIndex((l) => l.role === "user" && l.pending);
            const userLine: TranscriptLine = {
              id: msg.message_id || `user-${s.seq}`,
              role: "user",
              text: msg.text,
            };
            const next =
              idx === -1 ? [...prev, userLine] : prev.map((l, i) => (i === idx ? userLine : l));
            return [...next, { id: agentId, role: "agent", text: "" }];
          });
          setNotice(null);
          break;
        }
        case "turn.empty":
          s.awaitingTranscript = false;
          setLines((prev) => prev.filter((l) => !(l.role === "user" && l.pending)));
          setNotice(t("noSpeech"));
          break;
        case "agent.sources":
          break;
        case "agent.text.delta": {
          const id = s.agentLineId;
          if (id) patchLine(id, (l) => ({ ...l, text: l.text + msg.text }));
          break;
        }
        case "agent.audio":
          s.pendingAudioIndex = msg.index;
          break;
        case "turn.done": {
          const id = s.agentLineId;
          s.agentActive = false;
          s.agentLineId = null;
          if (id) {
            setLines((prev) =>
              prev
                .map((l) =>
                  l.id === id
                    ? { ...l, interrupted: msg.interrupted || l.interrupted, noAnswer: msg.no_answer }
                    : l
                )
                .filter((l) => !(l.id === id && !l.text.trim()))
            );
          }
          s.queue.finishTurn();
          break;
        }
        case "error":
          s.awaitingTranscript = false;
          s.agentActive = false;
          setLines((prev) => prev.filter((l) => !(l.role === "user" && l.pending)));
          setNotice(msg.message || t("connectionError"));
          break;
      }
      refreshStatus();
    },
    [refreshStatus, t]
  );

  const start = useCallback(
    (conversationId: string | null) => {
      const previous = sessionRef.current;
      if (previous && !previous.closed) teardown(previous, true);

      setLines([]);
      setNotice(null);
      setError(null);
      setMuted(false);
      setStatus("connecting");

      // Created inside the click handler so the AudioContext may start (autoplay policy).
      const queue = new PlaybackQueue();
      void queue.resume();
      const ws = new WebSocket(LIVE_TALK_URL);
      ws.binaryType = "arraybuffer";

      const s: Session = {
        ws,
        queue,
        vad: null,
        conversationId,
        ready: false,
        closed: false,
        awaitingTranscript: false,
        agentActive: false,
        pendingAudioIndex: null,
        agentLineId: null,
        seq: 0,
      };
      sessionRef.current = s;
      queue.onPlayingChange = () => refreshStatus();

      ws.onopen = () => send(s, { type: "session.start", conversation_id: conversationId });
      ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
        if (s.closed) return;
        if (typeof event.data !== "string") {
          // Binary frame: the WAV clip announced by the preceding `agent.audio`.
          if (s.pendingAudioIndex !== null) {
            s.queue.enqueue(s.pendingAudioIndex, event.data);
            s.pendingAudioIndex = null;
          }
          return;
        }
        try {
          handleMessage(s, JSON.parse(event.data) as LiveServerMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (s.closed) return;
        teardown(s, false);
        setError(t("connectionError"));
        setStatus("error");
      };

      createMicVad({
        onFrame: (p) => {
          levelRef.current = p;
        },
        onSpeechStart: () => {
          // Duck playback right away; a real barge-in is confirmed by onSpeechRealStart.
          if (s.queue.isBusy) s.queue.setVolume(0.2);
        },
        onSpeechRealStart: () => {
          if (s.closed) return;
          if (s.queue.isBusy || s.agentActive) bargeIn(s);
        },
        onMisfire: () => s.queue.setVolume(1),
        onSpeechEnd: (audio) => {
          if (s.closed || !s.ready || s.ws.readyState !== WebSocket.OPEN) return;
          s.queue.setVolume(1);
          s.ws.send(encodeWav(audio, TARGET_SAMPLE_RATE));
          s.awaitingTranscript = true;
          setLines((prev) => [
            ...prev.filter((l) => !(l.role === "user" && l.pending)),
            { id: `pending-${++s.seq}`, role: "user", text: "", pending: true },
          ]);
          setNotice(null);
          refreshStatus();
        },
      })
        .then((vad) => {
          if (s.closed) {
            void vad.destroy();
            return;
          }
          s.vad = vad;
          refreshStatus();
        })
        .catch((err: unknown) => {
          if (s.closed) return;
          teardown(s, true);
          setError(
            err instanceof MicPermissionError
              ? t("micDenied")
              : err instanceof MicUnavailableError
                ? t("micUnavailable")
                : t("vadError")
          );
          setStatus("error");
        });
    },
    [bargeIn, handleMessage, refreshStatus, t, teardown]
  );

  /** End the session; returns the conversation id the turns were saved to. */
  const end = useCallback((): string | null => {
    const s = sessionRef.current;
    if (!s) return null;
    teardown(s, true);
    sessionRef.current = null;
    setStatus("idle");
    return s.conversationId;
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const s = sessionRef.current;
    if (!s?.vad) return;
    if (muted) void s.vad.start();
    else void s.vad.pause();
    setMuted(!muted);
  }, [muted]);

  /** Current conversation id (adopted from `session.ready`). */
  const currentConversationId = useCallback(
    () => sessionRef.current?.conversationId ?? null,
    []
  );

  useEffect(
    () => () => {
      const s = sessionRef.current;
      if (s) teardown(s, true);
    },
    [teardown]
  );

  return {
    status,
    lines,
    notice,
    error,
    muted,
    levelRef,
    start,
    end,
    toggleMute,
    currentConversationId,
  };
}
