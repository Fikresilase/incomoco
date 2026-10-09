import type { Message, Modality, MessageStatus, Rating, Source, Lang } from "@/lib/api";

/** A message as rendered in the thread: server data plus local streaming state. */
export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  lang: Lang | null;
  modality: Modality;
  status: MessageStatus;
  no_answer: boolean;
  sources: Source[];
  feedback: Rating | null;
  has_audio: boolean;
  created_at: string;
  /** True while tokens are still arriving. */
  streaming: boolean;
  /** Error to show instead of / below the answer. */
  error: string | null;
  /** Present when the stream failed before the server accepted the message. */
  retry?: { text: string; modality: "text" | "dictation" };
}

export const LOCAL_ID_PREFIX = "local-";

export function isPersisted(message: UIMessage): boolean {
  return !message.id.startsWith(LOCAL_ID_PREFIX);
}

export function fromServer(message: Message): UIMessage {
  return {
    ...message,
    streaming: false,
    error: message.status === "error" ? "" : null,
  };
}

/** Context handed to composer add-ons (dictation, live talk) composed in by the route. */
export interface ComposerToolsContext {
  conversationId: string | null;
  /** True while an answer is streaming or the browser is offline. */
  disabled: boolean;
  /** Insert dictated text into the input box (for editing; never auto-sent). */
  insertText: (text: string) => void;
  /** Live talk finished: refresh the thread (and adopt a new conversation id). */
  onLiveTalkEnded: (conversationId: string | null) => void;
}
