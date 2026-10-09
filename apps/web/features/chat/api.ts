import {
  apiBlob,
  apiFetch,
  type Conversation,
  type ConversationSummary,
  type FeedbackRequest,
  type SpeakRequest,
} from "@/lib/api";

export const chatKeys = {
  conversations: ["conversations"] as const,
  conversation: (id: string | null) => ["conversation", id] as const,
};

export const listConversations = () =>
  apiFetch<ConversationSummary[]>("/conversations");

export const getConversation = (id: string) =>
  apiFetch<Conversation>(`/conversations/${encodeURIComponent(id)}`);

export const deleteConversation = (id: string) =>
  apiFetch<void>(`/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });

export const sendFeedback = (messageId: string, body: FeedbackRequest) =>
  apiFetch<void>(`/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: "POST",
    body,
  });

export const speakMessage = (messageId: string) =>
  apiBlob("/voice/speak", {
    method: "POST",
    body: { message_id: messageId } satisfies SpeakRequest,
    headers: { Accept: "audio/*" },
  });
