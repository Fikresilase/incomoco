# Phase 1 Implementation

## Architecture

Guest identity reuses the existing secure `inkomoko_sid` HTTP-only cookie and `chat_sessions` ownership model. `EntrepreneurProfile` is one lightweight profile per session. `BeneficiaryLink` is separate and stores only external-system identity, verification state, synchronization time, and provenance metadata.

## API

- `POST /api/v1/guest/session` creates or returns the current cookie-bound guest profile.
- `GET /api/v1/me/entrepreneur-profile` returns the current profile.
- `PATCH /api/v1/me/entrepreneur-profile` updates allowed profile fields only.
- `GET /api/v1/me/entrepreneur-context` returns minimal confirmed and user-stated context for future personalization.

Example update:

```json
{"preferred_language":"am","business_type":"coffee shop","business_stage":"operating","learning_goal":"increase profit"}
```

The context endpoint labels all current profile details as user-stated. Verified beneficiary data is intentionally not returned by these public endpoints.

## Beneficiary boundary

`BeneficiaryProfileProvider` defines `get_beneficiary`, `get_business_profile`, and `get_training_history`. `SyntheticBeneficiaryProvider` contains only the fixture ID `synthetic-demo-001`; it performs no matching by name or phone. Real linking must be authorized and verified by the future identity/integration owner.

## Frontend flow

The existing chat remains the single chat interface. The new APIs are designed for a lightweight guest onboarding/profile screen: language, optional business description/type, stage, and challenge/goal. A future registered account screen can use the same profile API after the real user authentication provider is available.

## Security and conversion

The server reads the session cookie and never trusts a client-supplied identity ID. Profile access is session-scoped. Guest-to-registered transfer is not automatically merged: the future flow must authenticate the registered account, obtain consent, check for an existing profile, and create an auditable, conflict-aware transfer.

## Configuration and limitations

No new environment variables are required. The current repository has no general entrepreneur authentication or external beneficiary credentials, so registered profiles and real beneficiary synchronization remain integration work. TTS, STT, RAG, admin, and existing chat behavior are preserved.

## Verification

Run from `apps/api`: `python -m pytest -q` and `ruff check app tests`. Run the frontend typecheck and lint with the stable Node path used by the project. Apply migration `9d4f2e6b1c77` with `alembic upgrade head`.

## Manual test

1. Open the existing chat to establish `inkomoko_sid`.
2. `POST /api/v1/guest/session` and confirm a guest profile is returned.
3. Patch the profile with a language, business type, stage, and goal.
4. Request `/api/v1/me/entrepreneur-context` and confirm only the current session's data appears.
5. Ask the existing assistant a business question and confirm chat still streams with the normal RAG citations.
6. Use a second browser cookie and confirm it receives a different empty profile.
