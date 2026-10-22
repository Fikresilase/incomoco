# Inkomoko Assistant MVP Implementation Plan

Assessment date: 2026-10-13

Scope: architecture and readiness assessment for three MVP capabilities:

1. AI Training Assistant
2. AI Business Advisory Assistant
3. Human Advisor Handoff

This document is based on code inspection of the current FastAPI backend, Next.js frontend, PostgreSQL ORM, Weaviate RAG adapter, document ingestion worker, admin dashboard, authentication, chat, voice, and analytics workflows in this repository. It does not propose integrating the separately tested Ethio-ASR project yet; the current Gemini/OpenRouter speech-to-text path remains the MVP baseline.

## 1. Current Architecture Assessment

### Backend

The backend is a FastAPI app organized around thin API routers, services, repositories, and adapter ports.

Existing routers:

- `POST /api/v1/chat`: streams a grounded assistant answer with server-sent events.
- `GET /api/v1/conversations`: lists conversations for the current anonymous browser session.
- `GET /api/v1/conversations/{conversation_id}`: returns one session-owned conversation.
- `DELETE /api/v1/conversations/{conversation_id}`: deletes one session-owned conversation.
- `POST /api/v1/messages/{message_id}/feedback`: stores thumbs-up/down feedback.
- `POST /api/v1/voice/transcribe`: transcribes uploaded WAV audio using the configured STT adapter.
- `POST /api/v1/voice/speak`: generates or replays TTS for assistant messages.
- `WS /api/v1/voice/live`: live voice conversation over WebSocket.
- `POST /api/v1/admin/login`, `POST /api/v1/admin/logout`, `GET /api/v1/admin/me`.
- `POST /api/v1/admin/documents`, `GET /api/v1/admin/documents`, `GET /api/v1/admin/documents/{id}`, `DELETE /api/v1/admin/documents/{id}`.
- `GET /api/v1/admin/analytics/summary`, `GET /api/v1/admin/analytics/gaps`, `POST /api/v1/admin/analytics/gaps/refresh`.

The main reusable service layer includes:

- `ChatService`: starts turns, routes small talk, retrieves sources, streams answers, persists messages, sources, and retrieval traces.
- `VoiceService`: handles dictation, TTS synthesis, TTS storage, and replay.
- `DocumentService`: validates and uploads knowledge-base documents.
- `AnalyticsService`: produces admin KPIs and knowledge-gap summaries.
- `IngestionWorker`: converts uploaded documents, chunks them, contextualizes chunks, embeds them, writes to Weaviate, and updates document status.

The adapter structure is strong for MVP extension. `Container` wires `LLMPort`, `EmbedderPort`, `RerankerPort`, `STTPort`, `TTSPort`, `VectorStorePort`, and `BlobStorePort`. This allows future provider changes without rewriting business services.

### Data Model

The current PostgreSQL model is intentionally chat-and-RAG focused. Existing tables are:

- `chat_sessions`: anonymous browser sessions only.
- `conversations`: session-owned conversation containers.
- `messages`: user/assistant messages with language, modality, status, no-answer flag, model, latency, and token fields.
- `message_sources`: citations for assistant messages.
- `message_feedback`: thumbs-up/down feedback.
- `retrieval_traces`: retrieval diagnostics per assistant message.
- `message_audio`: generated TTS metadata.
- `documents`: uploaded knowledge-base documents.
- `ingestion_jobs`: async ingest/delete work queue.
- `gap_reports`: generated unanswered-topic reports.
- `audit_log`: admin audit events.

Important current constraints:

- Message language is constrained to `am` or `en`.
- Document language is constrained to `am`, `en`, or `mixed`.
- Message modality is constrained to `text`, `dictation`, or `voice`.
- There is no registered beneficiary model.
- There is no public-user profile beyond anonymous session cookie.
- There is no advisor, handoff, case, training module, lesson progress, business profile, calculator, or advisory-plan model yet.

### RAG and Knowledge Base

The current RAG pipeline is:

1. Detect language using script counts.
2. Load IDs of documents with `status = 'ready'`.
3. Generate HyDE text using the configured LLM.
4. Embed the HyDE text or raw query.
5. Search Weaviate with hybrid BM25 + dense vector search.
6. Rerank candidate chunks.
7. Generate an answer only from numbered sources.
8. Persist sources and retrieval trace.

The generation prompt is conservative: it tells the model to answer only from sources and to return a no-answer marker if the sources do not contain the answer. This aligns with the requirement not to invent loan eligibility rules or financial terms.

Ingestion supports `.pdf`, `.docx`, `.txt`, and `.md`. PDFs are converted using the LLM vision converter, DOCX is converted locally, and text/Markdown are converted directly. The chunker is structure-aware, then optional contextual retrieval adds chunk context before embedding. Weaviate stores chunk fields including `document_id`, `title`, `breadcrumb`, `text`, `context`, `search_text`, `lang`, and page fields.

Current limitations for MVP:

- Documents do not have audience, country, capability, approval status, effective dates, source-owner, sensitivity, or channel metadata.
- Retrieval cannot filter by capability such as training, advisory, eligibility, or handoff policy.
- Retrieval cannot filter by beneficiary/public audience.
- Retrieval cannot filter by country or language beyond `document_id` inclusion.
- The answer prompt has one global behavior rather than capability-specific policies.

### Authentication and Authorization

Current auth supports:

- Anonymous public sessions through a browser session cookie.
- One demo admin username/password configured in `.env`.
- Admin-only access for document and analytics endpoints.

Current auth does not support:

- Registered beneficiary login.
- Advisor login.
- Multi-admin roles.
- Role-based permissions.
- Ownership of conversations by beneficiary account.
- Advisor assignment or handoff queue permissions.

### Frontend

The frontend is a Next.js app with:

- Public chat screen at `/`.
- Admin login at `/admin/login`.
- Admin overview at `/admin`.
- Admin document manager at `/admin/documents`.

Reusable UI and workflow pieces:

- `ChatApp` composes the sidebar, thread, composer, locale toggle, and optional voice tools.
- `Composer` supports typed input, stop button, dictation/live-talk tool slots, and IME-safe Enter handling.
- `useChat` handles SSE chat streaming, conversation selection, regeneration, retry, and local streaming state.
- `useDictation` and `useLiveTalk` compose voice features into the chat.
- `DocumentsManager` handles upload, document listing, polling processing states, search, filters, and delete.
- Admin shell already provides a guarded console layout and navigation.

Current frontend limitations for MVP:

- Chat has no mode selector for training vs advisory.
- No onboarding or login flow for registered beneficiaries.
- No beneficiary profile or business profile screens.
- No training module, lesson, quiz, progress, or certificate screens.
- No advisory intake, business diagnostic, action plan, calculator, or file attachment screens.
- No human advisor handoff request, status, queue, or advisor workspace.
- Frontend API types only support `Lang = "am" | "en"`.

### Voice and STT

The current STT provider is `GeminiChatSTT` through OpenRouter. It sends an audio part plus a transcription prompt to the configured Gemini chat model. Existing transcription prompt support includes:

- Prompt instruction language `am` or `en`.
- Vocabulary biasing, currently including `ኢንኮሞኮ=Inkomoko`.
- Recent conversation context for dictation.
- Amharic in Ethiopic script and English in Latin script.

This can be tested for Amharic, Afaan Oromo, and Somali without changing architecture by improving test fixtures and prompt/evaluation coverage while leaving `STTPort` and `GeminiChatSTT` in place.

## 2. Gap Analysis

### Capability 1: AI Training Assistant

Goal: guide users through approved business training content in Amharic and Afaan Oromo, with Somali if feasible, while tracking progress for registered beneficiaries.

Existing reusable components:

- RAG ingestion and retrieval for approved training documents.
- Grounded answer generation and no-answer behavior.
- Chat conversations, messages, citations, feedback, and retrieval traces.
- Admin document upload and status management.
- Analytics and gap reporting as a base for content quality monitoring.
- Composer, thread, citations, read-aloud, dictation, and live talk UI.
- Admin shell and navigation patterns.

Missing backend models and services:

- Training modules, lessons, activities, quizzes, and localized content metadata.
- User/beneficiary identity and enrollment.
- Lesson progress and completion events.
- Training-specific retrieval policy and prompt.
- Assessment scoring with deterministic grading rules where applicable.
- Content approval metadata and versioning.
- Capability/mode attached to conversations and messages.

Required API endpoints:

- `GET /api/v1/training/catalog`: list available training modules by language, country, audience, and beneficiary eligibility.
- `GET /api/v1/training/modules/{module_id}`: module detail and lesson list.
- `GET /api/v1/training/lessons/{lesson_id}`: lesson content metadata and linked KB references.
- `POST /api/v1/training/lessons/{lesson_id}/start`: start/resume lesson progress.
- `POST /api/v1/training/lessons/{lesson_id}/complete`: mark lesson complete.
- `POST /api/v1/training/quiz-attempts`: submit quiz answers and receive deterministic scoring.
- `GET /api/v1/training/progress`: beneficiary progress.
- `POST /api/v1/chat` extension: accept `capability = "training"` and optional `module_id`, `lesson_id`.

Required frontend screens:

- Public training entry screen or chat mode selector.
- Training catalog.
- Module detail and lesson player.
- Quiz/activity screen.
- Progress screen for registered beneficiaries.
- Admin content classification controls for training documents.

Knowledge base requirements:

- Approved training content only.
- Content separated by module, lesson, language, country, and audience.
- Clear source ownership, approval status, effective dates, and review dates.
- Separate deterministic quiz answer keys from generative assistant text.
- Multilingual glossary for business terms, especially Amharic, Afaan Oromo, Somali, and English.

User roles and permissions:

- Public users may browse public modules and ask general training questions.
- Registered beneficiaries may save progress, take quizzes, and receive program-specific training.
- Admins manage documents and training metadata.
- Future advisors may view beneficiary progress only with proper permission.

Multilingual requirements:

- First-class language codes beyond current `am | en`: at least `am`, `om`, `so`, `en`.
- UI translations for Afaan Oromo and Somali if exposed.
- Training content should be authored or approved per language, not machine-translated at answer time for policy-critical content.
- Language detection must not rely only on Ethiopic vs Latin script because Afaan Oromo and Somali use Latin script and will currently be treated as English.

Dependencies and integration risks:

- Requires schema migration that expands language constraints.
- Requires content governance before launch; otherwise training answers may cite draft or unapproved material.
- Current chunking may mix languages and topics if large bilingual documents are uploaded as one file.
- Gemini generation quality in Afaan Oromo and Somali must be tested before exposing those languages.

### Capability 2: AI Business Advisory Assistant

Goal: provide grounded, practical business advisory support for entrepreneurs without inventing financial terms, eligibility, or loan decisions.

Existing reusable components:

- Chat streaming workflow.
- RAG prompt rule to answer only from sources.
- Source citations and retrieval trace.
- Feedback capture.
- Voice transcription and TTS.
- Admin document management.
- Analytics for no-answer and low-confidence rates.

Missing backend models and services:

- Beneficiary and business profile.
- Business diagnostic intake.
- Advisory session type and conversation mode.
- Deterministic calculators for revenue, costs, margin, cash flow, stock turnover, break-even, and loan affordability scenarios.
- Advisory recommendations/action plans.
- Action items with due dates and status.
- Escalation triggers when advice requires a human advisor.
- Capability-specific safety policies for financial and legal/regulatory topics.

Required API endpoints:

- `GET /api/v1/me` and `PATCH /api/v1/me`: registered beneficiary profile.
- `GET /api/v1/businesses` and `POST /api/v1/businesses`: beneficiary business profiles.
- `PATCH /api/v1/businesses/{business_id}`: update profile.
- `POST /api/v1/advisory/intake`: submit diagnostic intake.
- `GET /api/v1/advisory/sessions` and `GET /api/v1/advisory/sessions/{id}`.
- `POST /api/v1/advisory/action-plans`: create/update action plan from deterministic inputs plus grounded RAG.
- `PATCH /api/v1/advisory/action-items/{id}`: update action item status.
- `POST /api/v1/calculators/{calculator_type}`: deterministic business calculations.
- `POST /api/v1/chat` extension: accept `capability = "advisory"` and optional `business_id`, `advisory_session_id`.

Required frontend screens:

- Business profile setup.
- Advisory mode chat.
- Diagnostic intake form.
- Business calculator screens.
- Action plan and action item tracker.
- Advisory history.
- Handoff CTA when confidence is low or user requests a human.

Knowledge base requirements:

- Approved advisory playbooks.
- Country-specific policy and program boundaries.
- Clear rules for what the assistant may and may not advise.
- Explicit no-answer/referral guidance for loan eligibility, interest, repayment terms, legal status, and regulated financial advice.
- Deterministic calculator definitions, formulas, units, and validation rules.

User roles and permissions:

- Public users can ask general advisory questions, but cannot save business profiles unless registered.
- Registered beneficiaries can save business profiles, diagnostics, action plans, and calculator history.
- Advisors can view assigned beneficiary advisory cases in a future advisor console.
- Admins can manage approved advisory KB and view aggregate analytics.

Multilingual requirements:

- Business terms must be consistently translated and recognized across Amharic, Afaan Oromo, Somali, and English.
- Calculator labels and outputs should be localized, but formulas must be deterministic and language-independent.
- Advisory prompts must answer in the user language while keeping official terms and numbers from sources.

Dependencies and integration risks:

- LLMs must not perform calculations free-form. Calculations should run in deterministic backend services and then be explained by the assistant if needed.
- Business profile data is sensitive; adding registered beneficiaries requires privacy and authorization controls.
- Current anonymous session ownership is not enough for advisory history across devices.
- Existing RAG does not yet filter by country, program, audience, or advisory topic.

### Capability 3: Human Advisor Handoff

Goal: allow users to escalate to a human advisor from chat, training, advisory, dictation, or live talk.

Existing reusable components:

- Conversations and message history.
- Retrieval traces and source citations for context.
- Feedback and no-answer/low-confidence flags.
- Admin shell as a starting point for internal screens.
- Audit log.
- Session cookie and anonymous conversation ownership.

Missing backend models and services:

- Handoff request/case model.
- Advisor user model and role.
- Assignment workflow.
- Status tracking.
- Priority and reason codes.
- Internal notes.
- User contact preferences and consent.
- Message transcript snapshot.
- Notification/outbound integration abstraction.
- Channel abstraction for future web, WhatsApp, Telegram, phone, and email.

Required API endpoints:

- `POST /api/v1/handoffs`: create handoff from conversation/message/capability context.
- `GET /api/v1/handoffs/{handoff_id}`: user-visible handoff status.
- `GET /api/v1/me/handoffs`: registered beneficiary handoff history.
- `GET /api/v1/admin/handoffs`: advisor/admin queue.
- `GET /api/v1/admin/handoffs/{handoff_id}`: case detail with transcript and sources.
- `PATCH /api/v1/admin/handoffs/{handoff_id}`: update status, priority, assignment, notes, and resolution.
- `POST /api/v1/admin/handoffs/{handoff_id}/messages`: advisor response or note.

Required frontend screens:

- Handoff modal or panel from chat.
- Contact/consent form for public users.
- Handoff status page or inline status card.
- Advisor/admin handoff queue.
- Advisor case detail with transcript, profile, business context, sources, and notes.
- Admin filters by status, priority, language, country, capability, and assigned advisor.

Knowledge base requirements:

- Handoff policy: when to escalate, what data to collect, and what not to promise.
- Program-specific contact and routing rules.
- Emergency/sensitive-topic policy if relevant.
- Advisor queue operating hours and expectation text.

User roles and permissions:

- Public users can request handoff but must provide contact details and consent.
- Registered beneficiaries can request handoff linked to their profile and business.
- Advisors can view and update assigned cases.
- Admins can view all cases and manage assignments.
- The assistant can suggest handoff for no-answer, low confidence, repeated negative feedback, user request, or policy-sensitive topics.

Multilingual requirements:

- Handoff reasons and status messages localized.
- Preserve original user language in transcript.
- Store preferred contact language.
- Route language-specific cases when advisor language skills are known.

Dependencies and integration risks:

- Requires role-based auth before advisor console can be safely built.
- Requires PII handling, consent text, retention policy, and access audit.
- Future WhatsApp/Telegram support should be designed as channel adapters, not baked into chat session tables.
- Need operational process: who receives handoffs, expected response time, and status definitions.

## 3. Proposed Data Models

The proposed models are additive and should be introduced through Alembic migrations. Names are suggestions; exact field types should follow existing SQLAlchemy style.

### Identity and Roles

`users`

- `id uuid pk`
- `role enum('public_shadow','beneficiary','advisor','admin')`
- `phone text nullable`
- `email text nullable`
- `display_name text nullable`
- `preferred_lang enum('am','om','so','en')`
- `country text nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

`beneficiary_profiles`

- `user_id uuid pk fk users.id`
- `beneficiary_external_id text nullable`
- `program text nullable`
- `location text nullable`
- `consent_at timestamptz nullable`
- `metadata jsonb`

`advisor_profiles`

- `user_id uuid pk fk users.id`
- `languages jsonb`
- `locations jsonb`
- `skills jsonb`
- `active boolean`

Recommended first step: introduce users only after deciding authentication method. Until then, keep anonymous sessions and design new tables to allow nullable `user_id`.

### Business Advisory

`businesses`

- `id uuid pk`
- `owner_user_id uuid fk users.id`
- `name text`
- `sector text`
- `country text`
- `location text`
- `stage text`
- `employee_count integer nullable`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

`advisory_sessions`

- `id uuid pk`
- `conversation_id uuid fk conversations.id nullable`
- `user_id uuid fk users.id nullable`
- `business_id uuid fk businesses.id nullable`
- `capability enum('training','advisory')`
- `topic text nullable`
- `status enum('active','completed','handoff_requested')`
- `created_at timestamptz`
- `updated_at timestamptz`

`calculator_runs`

- `id uuid pk`
- `user_id uuid fk users.id nullable`
- `business_id uuid fk businesses.id nullable`
- `conversation_id uuid fk conversations.id nullable`
- `calculator_type text`
- `inputs jsonb`
- `outputs jsonb`
- `lang enum('am','om','so','en')`
- `created_at timestamptz`

`action_plans`

- `id uuid pk`
- `user_id uuid fk users.id nullable`
- `business_id uuid fk businesses.id nullable`
- `advisory_session_id uuid fk advisory_sessions.id nullable`
- `title text`
- `status enum('draft','active','completed','archived')`
- `created_at timestamptz`
- `updated_at timestamptz`

`action_items`

- `id uuid pk`
- `action_plan_id uuid fk action_plans.id`
- `title text`
- `description text nullable`
- `due_date date nullable`
- `status enum('todo','doing','done','cancelled')`
- `source_message_id uuid fk messages.id nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### Training

`training_modules`

- `id uuid pk`
- `slug text unique`
- `title jsonb`
- `description jsonb`
- `country text nullable`
- `audience enum('public','beneficiary','advisor')`
- `status enum('draft','approved','retired')`
- `created_at timestamptz`
- `updated_at timestamptz`

`training_lessons`

- `id uuid pk`
- `module_id uuid fk training_modules.id`
- `order_index integer`
- `title jsonb`
- `summary jsonb`
- `document_id uuid fk documents.id nullable`
- `status enum('draft','approved','retired')`
- `created_at timestamptz`
- `updated_at timestamptz`

`training_progress`

- `id uuid pk`
- `user_id uuid fk users.id`
- `module_id uuid fk training_modules.id`
- `lesson_id uuid fk training_lessons.id nullable`
- `status enum('not_started','in_progress','completed')`
- `score numeric nullable`
- `started_at timestamptz nullable`
- `completed_at timestamptz nullable`
- `updated_at timestamptz`

`quiz_attempts`

- `id uuid pk`
- `user_id uuid fk users.id`
- `lesson_id uuid fk training_lessons.id`
- `answers jsonb`
- `score numeric`
- `passed boolean`
- `created_at timestamptz`

### Handoff

`handoff_requests`

- `id uuid pk`
- `conversation_id uuid fk conversations.id nullable`
- `message_id uuid fk messages.id nullable`
- `user_id uuid fk users.id nullable`
- `business_id uuid fk businesses.id nullable`
- `capability enum('training','advisory','general')`
- `channel enum('web','whatsapp','telegram')`
- `preferred_lang enum('am','om','so','en')`
- `reason_code text`
- `status enum('requested','triaged','assigned','in_progress','resolved','closed','cancelled')`
- `priority enum('low','normal','high','urgent')`
- `assigned_advisor_id uuid fk users.id nullable`
- `contact jsonb`
- `consent_at timestamptz nullable`
- `summary text nullable`
- `created_at timestamptz`
- `updated_at timestamptz`
- `resolved_at timestamptz nullable`

`handoff_events`

- `id uuid pk`
- `handoff_id uuid fk handoff_requests.id`
- `actor_user_id uuid fk users.id nullable`
- `event_type text`
- `body text nullable`
- `metadata jsonb`
- `created_at timestamptz`

### Knowledge Governance

Extend or complement `documents` with:

`knowledge_metadata`

- `document_id uuid pk fk documents.id`
- `capability jsonb` such as `["training","advisory","handoff"]`
- `audience enum('public','beneficiary','advisor','admin')`
- `country text nullable`
- `approved boolean`
- `approved_by uuid nullable`
- `approved_at timestamptz nullable`
- `effective_from date nullable`
- `effective_to date nullable`
- `source_owner text nullable`
- `sensitivity enum('public','internal','restricted')`
- `metadata jsonb`

Weaviate chunk properties should eventually include capability, audience, country, and approval metadata so retrieval can filter before generation.

## 4. Proposed API Contracts

### Chat Extension

Keep existing `POST /api/v1/chat` behavior compatible. Add optional fields only:

```json
{
  "message": "string",
  "conversation_id": "uuid | null",
  "modality": "text | dictation",
  "regenerate": false,
  "capability": "general | training | advisory",
  "module_id": "uuid | null",
  "lesson_id": "uuid | null",
  "business_id": "uuid | null",
  "advisory_session_id": "uuid | null"
}
```

SSE event compatibility should be preserved. New optional events may be added later, for example `action_plan.suggested` or `handoff.suggested`, but existing clients must keep working with `start`, `sources`, `delta`, `done`, and `error`.

### Training

`GET /api/v1/training/catalog?lang=am&country=ET`

Returns modules visible to the current user.

`GET /api/v1/training/modules/{module_id}`

Returns module metadata, lessons, status, and progress if registered.

`POST /api/v1/training/quiz-attempts`

Request:

```json
{
  "lesson_id": "uuid",
  "answers": [{"question_id": "string", "answer": "string | number | boolean | string[]"}]
}
```

Response:

```json
{
  "attempt_id": "uuid",
  "score": 0.8,
  "passed": true,
  "feedback": [{"question_id": "string", "correct": true, "explanation": "string"}]
}
```

Scoring must be deterministic. The LLM may explain approved feedback but must not decide correctness.

### Advisory

`POST /api/v1/advisory/intake`

Request:

```json
{
  "business_id": "uuid | null",
  "sector": "string",
  "location": "string",
  "goals": ["string"],
  "challenges": ["string"],
  "monthly_revenue": 0,
  "monthly_costs": 0,
  "currency": "ETB"
}
```

`POST /api/v1/calculators/{calculator_type}`

All calculator endpoints should validate numeric fields and return deterministic outputs. Example calculator types:

- `gross_margin`
- `break_even`
- `cash_flow`
- `inventory_turnover`
- `loan_affordability_scenario`

The loan affordability calculator must be framed as a scenario calculator, not an approval or eligibility decision.

### Handoff

`POST /api/v1/handoffs`

Request:

```json
{
  "conversation_id": "uuid | null",
  "message_id": "uuid | null",
  "business_id": "uuid | null",
  "capability": "training | advisory | general",
  "reason_code": "user_requested | no_answer | low_confidence | financial_terms | application_help | other",
  "preferred_lang": "am | om | so | en",
  "contact": {
    "name": "string",
    "phone": "string",
    "email": "string | null",
    "preferred_channel": "phone | sms | whatsapp | email"
  },
  "consent": true,
  "summary": "string | null"
}
```

Response:

```json
{
  "handoff_id": "uuid",
  "status": "requested",
  "created_at": "datetime",
  "message": "localized status text"
}
```

`GET /api/v1/admin/handoffs`

Admin/advisor queue with filters by status, priority, language, capability, and assignment.

`PATCH /api/v1/admin/handoffs/{handoff_id}`

Updates status, assignment, priority, notes, and resolution.

## 5. Frontend Implementation Plan

### Preserve Existing Chat

The current `/` chat should remain the default public experience. Add capability selection progressively:

1. Add a compact mode selector near the composer or in the empty state:
   - General
   - Training
   - Business Advice
2. Keep existing chat behavior when no mode is selected.
3. Pass optional `capability` to `POST /chat`.
4. Show mode-specific empty-state suggestions.

### Training UI

Add:

- `/training`: catalog.
- `/training/[moduleId]`: module detail.
- `/training/[moduleId]/lessons/[lessonId]`: lesson player.
- `/training/progress`: progress for registered users.

Reuse:

- Existing chat thread for lesson Q&A.
- Existing citations component for lesson source references.
- Existing admin shell patterns for future training admin pages.

### Advisory UI

Add:

- `/advisory`: advisory landing/intake.
- `/advisory/business`: business profile.
- `/advisory/calculators`: calculator index.
- `/advisory/action-plan`: current action plan.

Reuse:

- Existing chat for advisory Q&A.
- Existing message feedback for answer quality.
- Existing read-aloud and dictation controls.

### Handoff UI

Add:

- Handoff button in message actions and composer overflow.
- Handoff modal collecting reason, summary, contact details, preferred language, and consent.
- Handoff status card in chat after request creation.
- `/admin/handoffs`: queue.
- `/admin/handoffs/[id]`: case detail.

### Admin UI

Extend admin navigation beyond overview/documents:

- Documents
- Training
- Advisory
- Handoffs
- Analytics

Document manager should eventually support metadata editing: capability, audience, country, approval, effective dates, source owner, and sensitivity.

## 6. Multilingual Support Strategy

### Current State

Current backend and frontend types support only:

- `am`
- `en`

Language detection classifies Ethiopic script as Amharic and Latin script as English. Afaan Oromo and Somali both use Latin script, so they will currently be misclassified as English.

### MVP Language Model

Use ISO-style codes:

- `am`: Amharic
- `om`: Afaan Oromo
- `so`: Somali
- `en`: English

Required code changes before first-class Oromo/Somali support:

- Update PostgreSQL language check constraints.
- Update `Lang` types in backend domain models and Pydantic schemas.
- Update frontend `Lang` type.
- Update analytics language aggregation.
- Add UI message files for `om` and `so` if the UI is localized.
- Update STT prompt language settings to support Oromo and Somali transcription instructions.
- Replace script-only language detection with either:
  - user-selected language preference, plus script detection fallback, or
  - a lightweight LLM/router classification step for Latin-script local languages.

### Knowledge Base Strategy

Do not rely on runtime translation for official policy, loan, eligibility, or financial-term content. Use approved content per language where possible.

Recommended document format:

```markdown
## INK-KB-AM-017 | ኢንኮሞኮ ምን አገልግሎቶችን ይሰጣል?

Language: am
Country: ET
Capability: advisory, training
Audience: public
Approved: true
Source: AM-02

...
```

For Afaan Oromo and Somali, create parallel records with stable IDs and translation links:

- `translation_of: INK-KB-AM-017`
- `language: om`
- `language: so`

### STT Testing Without Architecture Change

Keep `GeminiChatSTT` and `STTPort` as-is. Add an evaluation harness around the existing `/api/v1/voice/transcribe` endpoint or `VoiceService.transcribe`.

Test set:

- 20 short Amharic clips.
- 20 short Afaan Oromo clips.
- 20 short Somali clips.
- Include male/female speakers if possible.
- Include business terms: loan, inventory, market, training, Inkomoko, repayment, revenue, profit.
- Include noisy mobile recordings.

Metrics:

- WER for Latin-script Oromo/Somali.
- CER for Amharic Ethiopic script.
- Key-term accuracy for domain terms.
- Empty/silence handling.
- Latency and payload size.

Prompt experiments that do not change architecture:

- Test `STT_PROMPT_LANG=am` and `STT_PROMPT_LANG=en`.
- Add vocabulary entries for Oromo and Somali terms.
- Add explicit instruction text covering Amharic, Afaan Oromo, Somali, and English.
- Pass recent conversation context as already implemented.

Acceptance gate for STT:

- The transcriber must preserve the spoken language rather than translating.
- It must keep English terms in Latin script.
- It must reliably capture domain terms.
- It must return empty text for silence.

## 7. Phased Implementation Roadmap

### Phase 0: Stabilize Current MVP Base

- Keep existing chat, document upload, admin, analytics, dictation, live talk, and RAG behavior unchanged.
- Add regression tests around current `/chat`, `/voice/transcribe`, document upload, and ingestion.
- Improve KB formatting and chunking for the current uploaded Inkomoko English/Amharic document.
- Add STT evaluation fixtures for Amharic, Oromo, and Somali using the existing Gemini/OpenRouter provider.

### Phase 1: Capability-Aware Chat

- Add `capability` to conversations/messages or advisory/training session tables.
- Add capability-specific prompt policies for general, training, and advisory.
- Add KB metadata and retrieval filters for approved content.
- Add frontend mode selector.
- Preserve existing chat as `general`.

### Phase 2: Training MVP

- Add training modules, lessons, and progress tables.
- Add training catalog and lesson screens.
- Add deterministic quiz attempts.
- Add admin metadata management for training content.
- Launch with approved Amharic and English content first, then Oromo/Somali after language support is validated.

### Phase 3: Advisory MVP

- Add beneficiary and business profile.
- Add advisory intake and advisory session models.
- Add deterministic calculators.
- Add action plan and action item tracking.
- Add advisory mode UI and calculator UI.

### Phase 4: Human Handoff MVP

- Add handoff request and event models.
- Add public and registered-user handoff creation.
- Add admin/advisor queue.
- Add status updates and transcript context.
- Add operational handoff policy and response-time wording.

### Phase 5: Channel Readiness

- Abstract inbound/outbound channels:
  - web
  - WhatsApp
  - Telegram
- Move channel-specific IDs into channel identity tables.
- Keep core conversation, message, handoff, and advisory services channel-neutral.

## 8. Acceptance Criteria

### Shared Criteria

- Existing chat, admin document upload, analytics, dictation, live talk, and read-aloud continue to work.
- All generated factual answers cite approved sources.
- If approved sources do not contain an answer, the assistant refuses to guess.
- Loan eligibility, interest rates, fees, repayment schedules, and approvals are never invented.
- All deterministic calculations are performed in backend calculator services, not by the LLM.
- Public users and registered beneficiaries are supported distinctly.
- New tables include migrations and tests.
- API contracts are documented and reflected in frontend TypeScript types.

### Training Assistant

- Public users can view public training modules.
- Registered beneficiaries can save progress.
- Lesson Q&A uses only approved lesson/training sources.
- Quizzes are scored deterministically.
- The assistant can hand off when the user asks for human help or when content is missing.

### Business Advisory Assistant

- Users can create or use a business profile.
- Advisory responses use approved advisory sources.
- Calculators return reproducible outputs for the same inputs.
- Action plans contain traceable source references or deterministic calculator outputs.
- Sensitive finance/regulatory questions are either answered from approved sources or escalated.

### Human Advisor Handoff

- Users can request a human advisor from chat.
- Handoff captures consent and contact details when needed.
- Handoff stores linked conversation/message context.
- Admin/advisor users can view, assign, update, and resolve handoffs.
- Users can see handoff status.

### Multilingual

- Amharic remains supported.
- Afaan Oromo and Somali are not treated as English once enabled.
- STT is evaluated with real clips before production exposure.
- UI text is localized for every language offered in navigation.

## 9. Technical Risks

- Language constraints are currently hard-coded to `am` and `en`; expanding them touches DB migrations, schemas, frontend types, analytics, prompts, and tests.
- Script-only language detection will fail for Oromo and Somali.
- Current RAG retrieval lacks metadata filtering, so approved training/advisory boundaries are not enforceable yet.
- Large bilingual documents may produce broad mixed chunks and unstable citations.
- Gemini/OpenRouter STT may transcribe, normalize, or translate Oromo/Somali unpredictably without targeted prompt and fixture testing.
- Registered beneficiary support introduces privacy, authorization, account recovery, and retention requirements.
- Handoff introduces PII and operational obligations; the software cannot solve advisor staffing and response-time policy by itself.
- Docker on Mac is not ideal for local MPS-based ASR. Since Ethio-ASR is not being integrated now, this is only a future architecture consideration.
- WhatsApp and Telegram later require channel identity, delivery status, opt-in/consent, and message formatting constraints.

## 10. Recommended First Development Task

Recommended first milestone: **Capability-Aware Knowledge and Chat Foundation**.

Why this first:

- It preserves the existing application behavior.
- It is required by all three MVP capabilities.
- It creates the governance boundary needed for approved training and advisory content.
- It avoids prematurely building screens that cannot yet enforce source policy.

Concrete first task:

1. Add a `capability` field to chat requests as optional, defaulting to `general`.
2. Add backend enum/types for `general`, `training`, and `advisory`.
3. Add KB metadata storage for `capability`, `audience`, `country`, `approved`, and `source_owner`.
4. Update retrieval to filter to approved documents/chunks for the selected capability.
5. Add a small admin metadata editor for uploaded documents.
6. Add tests proving existing general chat still works and training/advisory chat only retrieves approved matching content.

This milestone should not add beneficiary login, calculators, or handoff yet. It should establish the safe routing and retrieval foundation those features need.

## Most Important Findings

- The existing app has a solid RAG/chat foundation: streaming chat, citations, ingestion, Weaviate search, admin uploads, analytics, voice transcription, and TTS are already present.
- The app is currently built for anonymous public chat plus a single demo admin. It does not yet have registered beneficiaries, advisors, role-based permissions, training progress, business profiles, calculators, or handoff cases.
- The current language model is effectively Amharic plus English. Afaan Oromo and Somali require deliberate language model, schema, UI, prompt, analytics, and STT testing work because they use Latin script and are currently likely to be classified as English.
- The biggest architectural gap is not UI; it is governed retrieval. Training, advisory, and handoff all need approved, capability-specific, audience-aware knowledge before MVP features can be safe.
- The existing Gemini/OpenRouter STT implementation can be tested for Amharic, Afaan Oromo, and Somali through fixtures and prompt experiments without integrating Ethio-ASR or changing the provider architecture.

Recommended first implementation milestone: build the capability-aware knowledge and chat foundation, then layer Training, Advisory, and Handoff on top.
