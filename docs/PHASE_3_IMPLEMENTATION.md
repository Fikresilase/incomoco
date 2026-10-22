# Phase 3 Implementation

## Delivered foundation

Phase 3 now includes additive adviser records for business goals, practical business actions, learning progress, and structured skill evidence. Profiles have an `is_demo` flag and server-resolved `demo_key`; five synthetic personas were seeded by migration `3b7f1a2c9d44`.

The new dashboard API is:

- `POST /api/v1/demo/login` with a persona key such as `hana`
- `GET /api/v1/me/dashboard`
- `POST /api/v1/me/actions/{id}/start`
- `POST /api/v1/me/actions/{id}/complete`
- `POST /api/v1/me/actions/{id}/needs-help`

The browser experience is available at `/home`. The root route now directs to the dashboard; `/chat` remains the adviser conversation. The dashboard uses one primary priority, one practical action, a learning continuation prompt, and an adviser CTA. Demo selection writes an HTTP-only cookie and the server resolves it to a seeded profile; frontend-provided profile IDs are not trusted.

## Deterministic rules

The current foundation does not create knowledge scores or claim that an LLM assessed the entrepreneur. Actions require explicit start, complete, or needs-help requests. Future evidence aggregation should derive `unknown`, `needs_support`, `developing`, `understands`, and `applied` from stored lesson/practice/action signals only. A practice gap is an understood skill with an incomplete related business action.

## Amharic and voice

Hana is seeded with Amharic as the preferred language. The dashboard keeps the existing `/chat` route and TTS/read-aloud infrastructure available; it does not create a second voice provider or disable Amharic. Dashboard copy includes deterministic Amharic priority/action labels. Static lesson and Listen wiring remains the next UI increment.

## Verification

- Backend targeted Ruff: passed.
- Existing backend suite: `38 passed, 4 skipped`.
- Hana demo login/dashboard smoke test: passed against Docker API and PostgreSQL.
- Frontend typecheck: passed.
- Frontend production Webpack build: passed.

Known limitations: the demo content is synthetic and must remain visibly separate from real beneficiary data. Real authentication and beneficiary linking remain future work.

## Phase 3B design and implementation

`SkillStatusService` now derives transparent statuses from structured `SkillEvidence`: zero positive evidence is `unknown`; two negative/needs-help signals are `needs_support`; any positive signal is `developing`; two positive learning signals are `understands`; and a completed related business action upgrades an understood skill to `applied`. An open action on an understood/applied skill is exposed as `practice_gap`. These are statuses, not knowledge percentages.

`NextBestActionService` prioritizes explicit needs-help actions, then active open actions and practice gaps, and returns no more than three structured actions. A needs-help action becomes `talk_to_advisor`; a practice gap becomes `do`; otherwise the stored action type is preserved. Completing an action writes `business_action_completed` evidence, while needs-help writes `needs_help` evidence. No raw conversation text or hidden model reasoning is stored.

New user endpoints include `/me/skill-status`, `/me/actions`, and `/me/actions/{id}/follow-up?response=yes|not_yet|needs_help`. Admin pages and read endpoints include `/admin/entrepreneurs`, `/admin/entrepreneurs/[id]`, `/admin/adviser-queue`, and `/admin/knowledge-gaps`; queue items support `open`, `reviewing`, and `resolved`. Migration `4c8e2b1d6f55` seeds deterministic demo evidence and `5d9f3c2a7e66` adds multi-day progress and queue storage. Hana's API result is `Continue Cash Flow Basics`; cash flow is `needs_support`, record keeping is `understands`, and the open expense action is a practice gap. A daily follow-up Yes increments Hana from 3/7 to 4/7 and repeats are idempotent for the same day. Remaining work before the full brief is complete is dashboard Listen controls wired to existing TTS, richer unfinished-lesson selection, and the final professional dashboard visual polish.

## Final last-mile UX

The `/home` dashboard now presents a dominant Today’s Focus block, a separate Continue Learning card, a multi-day business-action card with accessible progress text and real follow-up buttons, and a calm adviser CTA. Core labels have deterministic Amharic translations, buttons are touch-sized, and the layout stacks naturally on narrow screens. The queue screen supports Active/Open/Reviewing/Resolved/All filters and state transitions.

Verification for this pass: backend `38 passed, 4 skipped`; targeted Ruff passed; frontend typecheck passed; frontend lint passed with only the existing 68 warnings from vendored VAD bundles; production Webpack build passed; Docker API migration and Hana follow-up smoke tests passed.

The existing `/voice/speak` endpoint remains message-ID based for chat; dashboard text now has its own bounded route using the same provider and cache infrastructure. Existing chat Amharic read-aloud remains unchanged.

## Guided journey UI

The entrepreneur home now uses a focused journey hierarchy: greeting and goal, Today’s Focus, Continue Learning, Today’s Business Action with canonical follow-up progress, and Ask Your Adviser. `/voice/speak-text` is a bounded dashboard-only route that validates `am`, `om`, `so`, and `en`, limits text to 800 characters, reuses `VoiceService.synthesize_text`, and caches generated dashboard clips through the existing blob store. The shared frontend `ListenButton` handles loading, playing/stopping, and friendly failure states without blocking text.

Docker smoke verification passed: `/health` returned `{"status":"ok"}` and unsupported TTS language returned HTTP 422. Existing backend tests remained `38 passed, 4 skipped`; frontend typecheck and production build passed.

## Final test closure

The closure suite adds direct tests for Amharic and English dashboard TTS request validation, invalid language/empty/overlong text rejection, and deterministic lesson selection. Selection covers started knowledge-gap lessons, active-goal relevance, completed exclusion, approval and active-state filtering, preferred-language filtering, and current/next de-duplication. The full backend result is `45 passed, 4 skipped`; Ruff passes; frontend typecheck and lint pass with only vendored VAD warnings. Production build and Docker API smoke remain passing.
