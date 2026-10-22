# AI Training Assistant Implementation Plan

This plan is based on inspection of the current FastAPI backend, Next.js frontend, PostgreSQL ORM models, Weaviate RAG pipeline, admin dashboard, authentication, and chat/voice workflows in `/Users/admin/Documents/incomoco`.

## 1. Existing reusable architecture

### Backend

- **FastAPI routing** is already organized under `apps/api/app/api/v1`, with chat, voice, admin auth, documents, and analytics routers registered in `apps/api/app/main.py`.
- **Anonymous public access** already exists through the `inkomoko_session` cookie middleware. Every browser receives a `chat_sessions.id`, which can support public training browsing, public AI questions, and unauthenticated lesson state if needed.
- **Admin authentication** exists through `/admin/login`, `/admin/logout`, and `/admin/me`, guarded by `AdminUser` in `apps/api/app/api/deps.py`. This can be reused for training content management.
- **PostgreSQL persistence** is already modeled with SQLAlchemy and Alembic. Existing durable chat tables include `chat_sessions`, `conversations`, `messages`, `message_sources`, `message_feedback`, `retrieval_traces`, and `message_audio`.
- **Document ingestion** already supports upload, storage, queued processing, deletion, and status tracking through `Document`, `IngestionJob`, `DocumentService`, `DocumentRepository`, and `IngestionWorker`.
- **Approved knowledge grounding** already exists through the document ingestion pipeline and the `RetrievalPipeline`. The current flow converts uploaded documents, chunks them, contextualizes chunks, embeds them, stores them in Weaviate, retrieves with hybrid search, reranks, and answers with citations.
- **Weaviate** already stores chunk metadata including `document_id`, `title`, `breadcrumb`, `search_text`, and `lang`. This should be extended with training metadata rather than creating a second RAG system.
- **Chat service** already separates turn creation, retrieval, grounded generation, citation persistence, and feedback. Training Q&A can reuse `ChatService` with scoped retrieval filters.
- **Multilingual language contracts** now support `am`, `om`, `so`, and `en` in chat, documents, conversations, messages, STT, TTS, and live-talk flows.
- **Analytics and gap reporting** already count sessions, messages, top documents, unused documents, no-answer rates, and gap reports. Training analytics can extend the same admin analytics area.

### Frontend

- **Chat UI** already supports conversation history, streaming assistant responses, citations, feedback, regenerate/retry, explicit language selection, microphone dictation, live-talk, and read-aloud.
- **Admin shell** already provides authenticated admin navigation and route guarding.
- **Document manager** already supports upload, search, status filtering, deletion, and ingestion polling.
- **Shared API and i18n utilities** already exist in `apps/web/lib/api`, `apps/web/lib/i18n`, and message catalogs.

## 2. Missing data models and APIs

The current application has no structured training-course model, no beneficiary/user account model, no enrollment model, and no quiz/assessment model.

### Proposed PostgreSQL models

- `users`
  - `id`, `email_or_phone`, `display_name`, `preferred_lang`, `role`, `created_at`, `updated_at`
  - Supports registered beneficiaries, advisors, and future channel identities.

- `beneficiary_profiles`
  - `user_id`, `country`, `business_sector`, `business_stage`, `program_id`, `external_crm_id`, `created_at`, `updated_at`
  - Stores non-sensitive beneficiary context needed for personalization and reporting.

- `training_courses`
  - `id`, `slug`, `status`, `audience`, `country`, `sort_order`, `created_at`, `updated_at`
  - Stable course identity independent of language.

- `training_course_translations`
  - `course_id`, `lang`, `title`, `summary`, `objectives`, `created_at`, `updated_at`
  - One row per approved language.

- `training_lessons`
  - `id`, `course_id`, `slug`, `status`, `lesson_type`, `duration_minutes`, `sort_order`, `created_at`, `updated_at`
  - Stable lesson identity independent of language.

- `training_lesson_translations`
  - `lesson_id`, `lang`, `title`, `body_markdown`, `summary`, `key_terms`, `created_at`, `updated_at`
  - Holds structured lesson content for UI rendering.

- `training_content_links`
  - `lesson_id`, `document_id`, `metadata`
  - Connects lessons to approved uploaded documents and Weaviate chunks.

- `training_enrollments`
  - `id`, `user_id`, `course_id`, `status`, `started_at`, `completed_at`, `last_lesson_id`
  - Registered beneficiary progress at course level.

- `training_lesson_progress`
  - `user_id`, `lesson_id`, `status`, `progress_percent`, `started_at`, `completed_at`, `last_seen_at`
  - Registered beneficiary progress at lesson level.

- `training_quizzes`
  - `id`, `lesson_id`, `status`, `passing_score`, `created_at`, `updated_at`

- `training_quiz_questions`
  - `id`, `quiz_id`, `question_type`, `prompt`, `choices`, `correct_answer`, `explanation`, `sort_order`
  - Answers must be authored or approved, not generated ad hoc.

- `training_quiz_attempts`
  - `id`, `user_id`, `quiz_id`, `score`, `passed`, `answers`, `started_at`, `submitted_at`

### Proposed API contracts

Public and beneficiary-facing:

- `GET /api/v1/training/courses?lang=am|om|so|en`
  - Returns published course cards in the selected language with fallback metadata marked explicitly.

- `GET /api/v1/training/courses/{course_id}?lang=...`
  - Returns course overview, lessons, enrollment state if authenticated, and public availability.

- `GET /api/v1/training/lessons/{lesson_id}?lang=...`
  - Returns one lesson translation plus related approved source links.

- `POST /api/v1/training/courses/{course_id}/enroll`
  - Requires registered beneficiary authentication.

- `POST /api/v1/training/lessons/{lesson_id}/progress`
  - Requires registered beneficiary authentication.

- `GET /api/v1/training/lessons/{lesson_id}/quiz`
  - Returns active quiz questions without correct answers.

- `POST /api/v1/training/quizzes/{quiz_id}/attempts`
  - Stores deterministic quiz results.

- `POST /api/v1/chat`
  - Reuse existing endpoint with optional training scope fields such as `capability: "training"`, `course_id`, and `lesson_id`.

Admin:

- `POST /api/v1/admin/training/courses`
- `PATCH /api/v1/admin/training/courses/{course_id}`
- `POST /api/v1/admin/training/lessons`
- `PATCH /api/v1/admin/training/lessons/{lesson_id}`
- `POST /api/v1/admin/training/lessons/{lesson_id}/content-links`
- `POST /api/v1/admin/training/quizzes`
- `PATCH /api/v1/admin/training/quizzes/{quiz_id}`

## 3. Training content ingestion design

Training content should reuse the existing admin document upload and ingestion pipeline.

Recommended approach:

1. Admin uploads approved course, lesson, or reference material through the existing document manager.
2. Add training metadata to `documents` and Weaviate chunks:
   - `content_kind`: `general_kb`, `training_course`, `training_lesson`, `training_quiz_reference`
   - `course_id`
   - `lesson_id`
   - `audience`
   - `country`
   - `approved_for_training`
3. Extend `VectorStorePort.hybrid_search` filtering to accept optional metadata filters while preserving the existing general RAG path.
4. For lesson-specific Q&A, pass a retrieval scope into the current `RetrievalPipeline` so answers are grounded only in the selected lesson/course plus approved general knowledge where allowed.
5. Keep citations from the existing `message_sources` table so users and admins can see which training sources informed each answer.

This avoids a second vector database, second retriever, or second answer generator.

## 4. Multilingual lesson design

- Use stable course and lesson IDs with separate translation rows per language.
- Store authored translations for Amharic and Afaan Oromo as MVP priority.
- Treat Somali as experimental until approved content and voice quality are validated.
- Do not infer that Latin-script text is English when a user has selected Oromo or Somali.
- Show explicit fallback state when a lesson is unavailable in the selected language.
- Keep financial terms, loan terms, eligibility statements, and business rules authored or approved by Inkomoko.
- Add a glossary table or JSON field for approved translations of recurring training terms.
- Keep deterministic calculations in backend service functions with unit tests; do not let the LLM invent formulas.

## 5. Proposed frontend user experience

Public users:

- Browse published training courses.
- Open lessons in the selected language.
- Ask the assistant questions about the current lesson.
- See citations and fallback messages when approved content is missing.
- Receive a prompt to sign in or register when progress tracking or certificates are requested.

Registered beneficiaries:

- Enroll in courses.
- Resume the last lesson.
- Track lesson completion and course progress.
- Take short quizzes.
- Ask lesson-grounded AI questions.
- Escalate to a human advisor from a lesson, quiz, or chat answer.

Admin users:

- Create and edit course shells.
- Add language-specific lesson content.
- Link uploaded approved documents to courses and lessons.
- Publish/unpublish courses and lessons.
- Manage quizzes and view completion analytics.

Future WhatsApp and Telegram:

- Keep course, lesson, quiz, progress, and chat services channel-neutral.
- Add channel adapters later that call the same APIs/services.
- Store external channel identities separately from core user identity.
- Use concise lesson summaries and quiz prompts suitable for messaging channels.

## 6. MVP implementation milestones

### Milestone 1: Training metadata foundation

- Add course, lesson, translation, content-link, enrollment, progress, quiz, and attempt models.
- Add Alembic migration.
- Add repositories and schemas.
- Add admin-only CRUD APIs for draft training content.
- Add metadata fields needed to filter existing RAG retrieval by course and lesson.

### Milestone 2: Public training catalog and lesson reader

- Add course list, course detail, and lesson detail screens.
- Support explicit language selection and fallback labels.
- Render lesson body from approved structured content.

### Milestone 3: Lesson-grounded assistant

- Extend chat request schema with training scope.
- Reuse `ChatService`, `RetrievalPipeline`, Weaviate, and citation persistence.
- Add tests proving lesson-scoped answers do not retrieve unrelated documents.

### Milestone 4: Beneficiary enrollment and progress

- Add registered beneficiary authentication or integrate with the chosen identity provider.
- Add enrollment, resume, completion, and progress APIs.
- Add progress UI.

### Milestone 5: Quizzes and deterministic scoring

- Add quiz authoring in admin.
- Add quiz-taking UI.
- Score answers deterministically in backend code.
- Store attempts and expose progress.

### Milestone 6: Human advisor handoff from training

- Reuse the planned handoff service for chat and training contexts.
- Include course, lesson, selected language, latest question, answer, citations, and quiz/progress context in the handoff record.

## 7. Acceptance criteria

- Public users can browse published courses and lessons without signing in.
- Registered beneficiaries can enroll, resume, and complete lessons.
- Training Q&A uses the existing RAG architecture and cites approved training content.
- Answers do not invent loan eligibility rules, financial products, interest rates, or repayment terms.
- Calculations used in lessons or quizzes are deterministic and covered by tests.
- Amharic and Afaan Oromo content can be authored and displayed independently.
- Somali can remain hidden or experimental until content and language quality are approved.
- Admin users can upload documents and link them to course/lesson metadata.
- Unsupported or missing translations show clear fallback behavior.
- WhatsApp and Telegram can be added later without duplicating training logic.

## 8. Recommended first implementation task

Start with the **training metadata foundation**:

1. Add PostgreSQL models and Alembic migration for courses, lessons, translations, content links, enrollments, progress, quizzes, and attempts.
2. Add backend repositories and Pydantic schemas.
3. Add admin-only CRUD APIs for courses, lessons, and lesson-document links.
4. Extend document and Weaviate metadata to support course and lesson filters.
5. Add focused tests for model constraints, language fallback, and scoped retrieval filters.

This gives the MVP a durable content structure while preserving the existing chat, RAG, document ingestion, admin, and voice behavior.
