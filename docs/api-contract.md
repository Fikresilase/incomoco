# API Contract (v1)

The single source of truth for the frontend ↔ backend interface. The FastAPI app also serves OpenAPI at `GET /openapi.json` and Swagger UI at `/docs`.

- **Base URL:** `http://localhost:8000/api/v1` (browser) · `http://api:8000/api/v1` (server-side, inside Compose)
- **Credentials:** every request uses `credentials: "include"`. Two httpOnly cookies are involved:
  - `inkomoko_sid`: the anonymous chat session, set automatically by the API on the first request.
  - `inkomoko_admin`: the admin JWT, set by `POST /admin/login`.
- **Errors:** non-2xx responses return `{ "detail": string }`.
- **IDs:** UUID strings. **Timestamps:** ISO-8601 UTC.

---

## Shared types

```ts
type Lang = "am" | "en";
type Modality = "text" | "dictation" | "voice";

interface Source {
  index: number;            // citation number used in the answer text: [1]..[8]
  document_id: string;
  title: string;
  breadcrumb: string;       // "Doc › Section › Subsection"
  page_start: number | null;
  page_end: number | null;
  snippet: string;          // ≤ 300 chars of the chunk
  score: number;            // rerank score 0..1
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;          // assistant content is Markdown with [n] citations
  lang: Lang;
  modality: Modality;
  status: "complete" | "interrupted" | "error";
  no_answer: boolean;
  sources: Source[];        // assistant only, else []
  feedback: 1 | -1 | null;  // assistant only
  has_audio: boolean;       // TTS audio already stored in MinIO
  created_at: string;
}

interface ConversationSummary { id: string; title: string; created_at: string; updated_at: string; }
interface Conversation extends ConversationSummary { messages: Message[]; }

type DocumentStatus = "queued" | "processing" | "ready" | "failed" | "deleting" | "deleted";
interface KbDocument {
  id: string; title: string; filename: string; mime: string; size_bytes: number;
  lang: "am" | "en" | "mixed" | null; page_count: number | null;
  status: DocumentStatus; chunk_count: number; error: string | null;
  uploaded_at: string; processed_at: string | null;
}
```

---

## Chat (anonymous session)

### `POST /chat` (Server-Sent Events)
Request:
```json
{ "message": "string (1..4000)", "conversation_id": "uuid | null", "modality": "text | dictation", "regenerate": false }
```
- Without `conversation_id`, a new conversation is created.
- With `regenerate: true` (and a `conversation_id`), the server deletes the last assistant message and answers the last user message again. `message` is ignored.

Response: `text/event-stream`. Each event is `event: <name>\ndata: <json>\n\n`.

| Event | Data |
|---|---|
| `start` | `{ conversation_id, user_message_id, assistant_message_id, lang }` |
| `sources` | `{ sources: Source[] }` (may be empty) |
| `delta` | `{ text }`: append to the answer |
| `done` | `{ assistant_message_id, no_answer, latency_ms }` |
| `error` | `{ code, message }` |

### `GET /conversations` → `ConversationSummary[]`
Only this session's conversations, newest first.

### `GET /conversations/{id}` → `Conversation`

### `DELETE /conversations/{id}` → `204`

### `POST /messages/{id}/feedback` → `204`
```json
{ "rating": 1, "comment": "optional string" }
```

---

## Voice

### `POST /voice/transcribe` (dictation)
`multipart/form-data` with field `audio`: a WAV file (16 kHz, mono, PCM16), ≤ 60 s.
→ `{ "text": "string", "lang": "am" | "en" }`

### `POST /voice/speak` (read aloud)
```json
{ "message_id": "uuid" }
```
→ `audio/wav` bytes (24 kHz mono PCM16; Gemini TTS only produces PCM, which the API wraps in WAV). Served from MinIO if the message has stored audio; otherwise generated, stored, and returned.

### `WS /voice/live` (live talk)
URL: `ws://localhost:8000/api/v1/voice/live`. The session cookie is sent automatically.

**Client → server**
| Frame | Meaning |
|---|---|
| text `{"type":"session.start","conversation_id":"uuid|null"}` | Must be sent first |
| **binary** | One complete user utterance as WAV (16 kHz, mono, PCM16), sent after the VAD detects end of speech |
| text `{"type":"interrupt"}` | User barged in: cancel the current answer and stop audio |
| text `{"type":"session.end"}` | Close |

**Server → client** (JSON text frames unless noted)
| Event | Data |
|---|---|
| `session.ready` | `{ conversation_id }` |
| `user.transcript` | `{ text, lang, message_id }` |
| `turn.empty` | `{}`: no speech recognized, nothing to answer |
| `agent.sources` | `{ sources: Source[] }` |
| `agent.text.delta` | `{ text }` |
| `agent.audio` | `{ index, format: "wav" }`, **immediately followed by one binary frame** with that sentence's audio (WAV). Play in `index` order |
| `turn.done` | `{ agent_message_id, interrupted: boolean, no_answer: boolean }` |
| `error` | `{ code, message }` |

---

## Admin (requires the `inkomoko_admin` cookie)

### Auth
| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/admin/login` | `{ username, password }` → `200 { username }` + cookie · `401` |
| `POST` | `/admin/logout` | → `204` |
| `GET` | `/admin/me` | → `{ username }` · `401` |

### Documents
| Method | Path | Notes |
|---|---|---|
| `POST` | `/admin/documents` | `multipart/form-data` field `file` (PDF/DOCX/TXT/MD, ≤ 25 MB) → `202 KbDocument` · `409` duplicate · `413` too large · `415` unsupported type |
| `GET` | `/admin/documents?status=&q=&page=1&page_size=20` | → `{ items: KbDocument[], total: number }`. Deleted documents are excluded unless `status=deleted` |
| `GET` | `/admin/documents/{id}` | → `KbDocument` |
| `DELETE` | `/admin/documents/{id}` | → `202 KbDocument` (status `deleting`) |

### Analytics
`GET /admin/analytics/summary?days=30` →
```ts
{
  range_days: number;
  kpis: {
    conversations: number; messages: number; unique_sessions: number; documents_ready: number;
    feedback_positive_rate: number | null;   // 0..1
    no_answer_rate: number | null;           // 0..1 of assistant messages
    low_confidence_rate: number | null;      // 0..1, top rerank score below threshold
    p50_first_token_ms: number | null; p95_first_token_ms: number | null;
    p95_voice_turn_ms: number | null;
    error_rate: number | null;
  };
  timeseries: { date: string; conversations: number; messages: number }[];        // YYYY-MM-DD, every day in range
  feedback_timeseries: { date: string; positive: number; negative: number }[];
  languages: { am: number; en: number };                                          // user messages
  modalities: { text: number; dictation: number; voice: number };                 // user messages
  devices: { mobile: number; desktop: number; unknown: number };                  // sessions
  top_documents: { document_id: string; title: string; citations: number }[];     // top 10
  unused_documents: { document_id: string; title: string }[];                     // ready, never cited
}
```

`GET /admin/analytics/gaps` and `POST /admin/analytics/gaps/refresh` →
```ts
{
  generated_at: string | null;
  question_count: number;
  topics: { topic: string; count: number; examples: string[] }[];
  recent_unanswered: { question: string; lang: Lang; created_at: string }[];     // latest 20
}
```

---

## Health
`GET /health` → `{ "status": "ok" }` (not under `/api/v1`)
