# Phase 4 Human Adviser Verification

## Local stack

Run the `main` checkout with `COMPOSE_PROJECT_NAME=inkomoko-main` and ports `3002` (web), `8012` (API), `5435` (PostgreSQL), `9012` (MinIO), `8082` (Weaviate). The API applies Alembic head `0019_human_audio_metadata` on startup.

## Available workflow surfaces

- Admin: `/admin/advisers`
- Adviser sign-in: `/adviser/login`
- Adviser workspace: `/adviser`
- Entrepreneur messages: `/messages`
- Entrepreneur notifications: `/notifications`
- Existing learning resources remain at `/learn` and `/learning/resources/{id}`.

Admin creates an adviser with a unique email and temporary password of at least 12 characters, then assigns an organization-scoped entrepreneur. The temporary password must be handed over securely because email delivery is not configured.

## API contracts used

- `POST /api/v1/admin/login`
- `GET/POST /api/v1/human/admin/advisers`
- `POST /api/v1/human/admin/advisers/{id}/deactivate`
- `GET /api/v1/human/admin/entrepreneurs`
- `POST /api/v1/human/assignments`
- `GET /api/v1/human/adviser/entrepreneurs`
- `GET/POST /api/v1/human/conversations/{profile_id}`
- `GET /api/v1/human/conversations/{conversation_id}/messages`
- `POST /api/v1/human/conversations/{conversation_id}/messages`
- `POST /api/v1/human/conversations/{conversation_id}/audio`
- `GET /api/v1/human/messages/{message_id}/audio`
- `GET /api/v1/human/notifications` and unread/read variants
- `GET/POST /api/v1/human/recommendations/{profile_id}`
- `GET /api/v1/human/admin/assignments/history`

All state-changing browser requests use the CSRF cookie/header pair. Audio playback is streamed only after current authorization is checked.

## Automated results

- Ruff: passed.
- Backend suite: 46 passed, 6 Docker-dependent skips when run inside the API container.
- Docker-network integration/security suite: 6 passed, 2 warnings.
- Frontend TypeScript: passed.
- Frontend ESLint: 0 errors; generated VAD assets produce warnings.
- Frontend production build: passed with existing ONNX/VAD bundler warnings.
- Cleanup command: `python -m app.commands.cleanup_human_audio`, executed successfully.

## Manual end-to-end test

1. Sign in as an admin and create an adviser account.
2. Open the adviser sign-in page in a separate browser profile and sign in with the temporary credentials.
3. Assign a disposable registered entrepreneur profile from the admin page.
4. Confirm the adviser sees only the assigned entrepreneur.
5. Open the conversation and exchange text messages in both directions.
6. Record a WAV voice note from the existing browser recorder, send it, and play it from the other account.
7. Confirm notification and unread counts, then mark the notification/conversation read.
8. Recommend an approved resource and confirm it appears in the entrepreneur's learning flow.
9. Reassign the entrepreneur from the admin page.
10. Confirm the old adviser receives 404/authorization denial for conversation metadata, messages, upload, and audio playback; confirm the new adviser can open a new current-assignment conversation.

## Known limitations

The full browser journey above was not claimed as automated in this pass because browser automation and microphone permission were unavailable. The repository still needs dedicated tests for every requested cross-organization and reassignment-history matrix case before Phase 4 can be marked GO.
