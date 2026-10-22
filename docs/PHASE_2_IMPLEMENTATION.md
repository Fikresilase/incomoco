# Phase 2 Implementation

## Models and approval

`LearningSkill` is a managed topic catalog. `LearningResource` supports document, guideline, audio, video, and text lesson metadata, language, difficulty, MinIO/storage references, existing document references, provenance, version, approval state, active state, and demo state. Public queries require an active skill and `approved` plus active resource.

Migration: `6f3a1c8b2d44`, following `9d4f2e6b1c77`.

## APIs

- `GET /api/v1/learning/skills`
- `GET /api/v1/learning/resources?skill=cash_flow&language=am&resource_type=audio`
- `GET /api/v1/learning/resources/{id}`
- `POST /api/v1/learning/recommendations` with `{ "question": "I sell every day but have no money left" }`

Recommendations resolve the server-side guest profile and never trust frontend identity fields.

## Logic

The current implementation uses an explainable deterministic classifier for cash flow, pricing/profit, and record keeping. It requires a valid active skill and confidence threshold, filters to approved active resources in the user's preferred language, ranks by learning format, and caps results at three. No match returns an empty recommendation. Recommendation failures return an empty result rather than breaking chat.

## Demo content

The migration seeds three clearly synthetic English text resources: Cash Flow Basics, Pricing and Profit, and Record Keeping. They are labeled as demo content and must be replaced by trainer-approved Inkomoko material before production use. No official curriculum is claimed.

## Limitations and next step

Phase 2B now emits a backwards-compatible `learning_recommendations` SSE event after the normal answer, persists only resource IDs and display metadata on assistant messages, renders compact cards in chat, and provides `/learning/resources/[id]` for safe resource viewing. Public resource access remains server-filtered to active approved content. Trainer/admin CRUD, interaction analytics, and non-English approved resource content remain the next hardening increment. Existing RAG, STT, TTS, voice, and chat remain unchanged.

## Phase 2C operational completion

The existing single admin-cookie authorization is reused for learning management; there is no separate trainer role in this repository. Admin endpoints now manage skills, create resource metadata, validate draft/review/approved/archived transitions, record status changes in the existing audit log, and expose approved-resource coverage by skill/language/type. End-user APIs continue enforcing approved and active server-side.

The frontend build no longer imports `next/font/google`; it uses an offline-safe system stack with Ethiopic fallback. The package remains Bun-based (`packageManager: bun@1.3.2`) and the build script uses Webpack explicitly to avoid the observed Turbopack worker-port failure. A final build should be rerun with the project's Bun installation.

## Phase 2C finalization

Admin routes are available at `/admin/learning/skills` and `/admin/learning/resources`, protected by the existing admin cookie. The current authorization model has one `admin` role, so all learning management and approval actions use `AdminUser`; no new trainer/reviewer identity system was introduced. Backend transition validation remains authoritative.

Learning interaction events are stored in `learning_events` with minimal metadata. `learning_recommendation_shown` and `learning_resource_opened` are accepted through the learning event endpoint. The unique `(event_type, message_id, resource_id)` index provides server-side idempotency when the originating message ID is supplied; analytics failures are isolated from resource viewing.

Private learning media uses `GET /api/v1/learning/resources/{id}/media`. The backend verifies approved/active state and returns a short-lived MinIO presigned URL using `LEARNING_MEDIA_URL_TTL_SECONDS` (default 300 seconds). No MinIO credentials or bucket details are exposed. Existing document references remain canonical and are not duplicated.

Coverage is available at `/api/v1/admin/learning/coverage` and reports approved active resource types by skill and language. Missing Amharic and Afaan Oromo content is therefore visible as a coverage gap. Approved trainer content still needs to be supplied and reviewed by Inkomoko trainers; demo resources are not official curriculum.

## Manual testing

Apply `alembic upgrade head`, create/update a guest profile with `preferred_language=en`, call the recommendation endpoint with a cash-flow question, and verify only approved demo resources appear. Call the public resource route for a draft or inactive resource and verify it is absent or returns 404. Use an unrelated question and verify `recommended=false`.

## Phase 2 completion status

The finalization pass adds admin create/edit forms, explicit review/approve/archive controls, approved coverage visibility, recommendation-impression and resource-open event wiring, and private media access through the signed-URL endpoint. Public resource responses no longer expose internal storage references. Open events carry the originating message ID when opened from a recommendation, and recommendation impressions are deduplicated by `(event_type, message_id, resource_id)`.

Verification completed: frontend typecheck passed; frontend production build passed with Webpack; frontend lint passed with no project-code errors (the remaining warnings are from vendored VAD bundles); Docker services and migration `2a6e9c4b7d11` are available. The backend async plugin was already declared in `apps/api/pyproject.toml` and locked in `apps/api/uv.lock`; the earlier 9 failures came from invoking pytest at the repository root, where the backend pytest configuration was not discovered. Running from `apps/api` with `.venv/bin/pytest -q` now produces `38 passed, 4 skipped`, followed by `.venv/bin/ruff check app tests` with all checks passing.

Remaining product dependency: demo resources must be replaced with approved Inkomoko training/advisory content, including reviewed Amharic and Afaan Oromo versions. Somali remains experimental and should stay disabled unless explicitly enabled and evaluated.
