/**
 * Types mirroring docs/api-contract.md (v1). Keep in sync with the contract.
 */

export type Lang = "am" | "en";
export type Modality = "text" | "dictation" | "voice";

export interface Source {
  /** Citation number used in the answer text: [1]..[8] */
  index: number;
  document_id: string;
  title: string;
  /** "Doc › Section › Subsection" */
  breadcrumb: string;
  page_start: number | null;
  page_end: number | null;
  /** ≤ 300 chars of the chunk */
  snippet: string;
  /** Rerank score 0..1 */
  score: number;
}

export type MessageStatus = "complete" | "interrupted" | "error";
export type Rating = 1 | -1;

export interface Message {
  id: string;
  role: "user" | "assistant";
  /** Assistant content is Markdown with [n] citations */
  content: string;
  lang: Lang;
  modality: Modality;
  status: MessageStatus;
  no_answer: boolean;
  /** Assistant only, else [] */
  sources: Source[];
  /** Assistant only */
  feedback: Rating | null;
  /** TTS audio already stored */
  has_audio: boolean;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation extends ConversationSummary {
  messages: Message[];
}

export type DocumentStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "deleting"
  | "deleted";

export interface KbDocument {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size_bytes: number;
  lang: "am" | "en" | "mixed" | null;
  page_count: number | null;
  status: DocumentStatus;
  chunk_count: number;
  error: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

/* ----------------------------- Chat ----------------------------- */

export interface ChatRequest {
  /** 1..4000 chars. Ignored by the server when `regenerate` is true. */
  message: string;
  conversation_id: string | null;
  modality: "text" | "dictation";
  regenerate: boolean;
}

export interface ChatStartEvent {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  lang: Lang;
}
export interface ChatSourcesEvent {
  sources: Source[];
}
export interface ChatDeltaEvent {
  text: string;
}
export interface ChatDoneEvent {
  assistant_message_id: string;
  no_answer: boolean;
  latency_ms: number;
}
export interface ApiErrorEvent {
  code: string;
  message: string;
}

export type ChatStreamEvent =
  | { event: "start"; data: ChatStartEvent }
  | { event: "sources"; data: ChatSourcesEvent }
  | { event: "delta"; data: ChatDeltaEvent }
  | { event: "done"; data: ChatDoneEvent }
  | { event: "error"; data: ApiErrorEvent };

export interface FeedbackRequest {
  rating: Rating;
  comment?: string;
}

/* ----------------------------- Voice ---------------------------- */

export interface TranscribeResponse {
  text: string;
  lang: Lang;
}

export interface SpeakRequest {
  message_id: string;
}

/** Client → server text frames on WS /voice/live (binary frames carry WAV utterances). */
export type LiveClientMessage =
  | { type: "session.start"; conversation_id: string | null }
  | { type: "interrupt" }
  | { type: "session.end" };

/** Server → client JSON text frames on WS /voice/live. */
export type LiveServerMessage =
  | { type: "session.ready"; conversation_id: string }
  | { type: "user.transcript"; text: string; lang: Lang; message_id: string }
  | { type: "turn.empty" }
  | { type: "agent.sources"; sources: Source[] }
  | { type: "agent.text.delta"; text: string }
  | { type: "agent.audio"; index: number; format: "wav" }
  | {
      type: "turn.done";
      agent_message_id: string;
      interrupted: boolean;
      no_answer: boolean;
    }
  | { type: "error"; code: string; message: string };

/* ----------------------------- Admin ---------------------------- */

export interface AdminLoginRequest {
  username: string;
  password: string;
}
export interface AdminUser {
  username: string;
}

export interface DocumentListParams {
  status?: DocumentStatus;
  q?: string;
  page?: number;
  page_size?: number;
}
export interface DocumentListResponse {
  items: KbDocument[];
  total: number;
}

export interface AnalyticsKpis {
  conversations: number;
  messages: number;
  unique_sessions: number;
  documents_ready: number;
  /** 0..1 */
  feedback_positive_rate: number | null;
  /** 0..1 of assistant messages */
  no_answer_rate: number | null;
  /** 0..1, top rerank score below threshold */
  low_confidence_rate: number | null;
  p50_first_token_ms: number | null;
  p95_first_token_ms: number | null;
  p95_voice_turn_ms: number | null;
  error_rate: number | null;
}

export interface AnalyticsSummary {
  range_days: number;
  kpis: AnalyticsKpis;
  /** YYYY-MM-DD, every day in range */
  timeseries: { date: string; conversations: number; messages: number }[];
  feedback_timeseries: { date: string; positive: number; negative: number }[];
  /** User messages */
  languages: { am: number; en: number };
  /** User messages */
  modalities: { text: number; dictation: number; voice: number };
  /** Sessions */
  devices: { mobile: number; desktop: number; unknown: number };
  /** Top 10 */
  top_documents: { document_id: string; title: string; citations: number }[];
  /** Ready, never cited */
  unused_documents: { document_id: string; title: string }[];
}

export interface GapReport {
  generated_at: string | null;
  question_count: number;
  topics: { topic: string; count: number; examples: string[] }[];
  /** Latest 20 */
  recent_unanswered: { question: string; lang: Lang; created_at: string }[];
}
