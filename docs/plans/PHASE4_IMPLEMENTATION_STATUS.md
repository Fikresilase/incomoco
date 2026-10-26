# Phase 4 Implementation Status

## Status

**Task 4.0 and Task 4.0B are complete. Task 4.1A/B/4.1C/4.1D remains in progress and is intentionally not marked complete.**

The first additive Task 4.1 foundation changes are present, but authentication behavior has not yet been switched over.

## Current Implementation Progress

Added:

- `Organization`, `UserAccount`, `Role`, `Permission`, `AccountRole`, `RolePermission`, and `AuthSession` ORM entities.
- Nullable organization and verified foreign-key ownership columns on `EntrepreneurProfile`.
- Alembic revision `0012_security_foundation` with seeded role and permission definitions.
- Production configuration validation rejecting the known demo password, placeholder JWT secret, short production secrets, and insecure production cookies.

Still required before completion:

- Super-admin bootstrap CLI and explicit local-development setup.
- Replacement of shared-admin route dependency with persisted-account authorization.
- Registered entrepreneur profile ownership and secure guest-linking flow.
- Focused authorization and migration tests.
- CSRF validation for cookie-authenticated mutations.

Implemented since the previous update:

- `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`, and `/me` endpoints.
- Bcrypt password hashing and verification.
- 15-minute access JWTs and seven-day opaque refresh sessions with rotation and replay rejection.
- Account active-state checks during login and refresh.
- Default role-permission assignment helper for the seeded roles.
- Persisted-account admin login and reusable current-account/permission dependencies.
- Interactive bootstrap command: `cd apps/api && .venv/bin/python -m app.bootstrap --email <email> --display-name <name>`.

## Current Architecture Inventory

| Capability | Current state | Reusable implementation | Phase 4 implication |
|---|---|---|---|
| Authentication | Partially implemented | Persisted account routes, session service, admin auth routes | Profile ownership, CSRF, bootstrap tests, and complete route migration remain |
| User/account model | Missing | `EntrepreneurProfile.user_id` is only an unvalidated nullable reference | Requires a real account model and ownership relation before messaging or role permissions |
| Roles/permissions | Partially implemented | `require_admin` and admin-only route dependencies | No adviser/entrepreneur principals, configurable permissions, or object-level policy |
| Entrepreneur identity | Partially implemented | `EntrepreneurProfile`, guest/registered identity fields, session middleware | Suitable domain profile, but ownership and account lifecycle are incomplete |
| Admin dashboard | Partially implemented | `apps/web/app/admin`, `api/v1/admin_auth.py`, admin routes | Existing admin operations can be extended after account authorization is safe |
| Adviser queue | Partially implemented | `AdviserQueueItem`, `services/adviser.py`, `api/v1/adviser_admin.py` | Queue is operational escalation, not adviser assignment or private workspace access |
| Learning registry | Implemented and reusable | `LearningSkill`, `LearningResource`, approval states, learning APIs | Human recommendations should reference approved resources, not duplicate lessons |
| Automatic recommendations | Implemented and reusable | `services/learning.py`, dashboard APIs | Must remain separate from attributed adviser recommendations |
| Human messaging | Missing | Existing AI `Conversation`/`Message` tables are not suitable for human chat | Requires separate conversation/message domain and authorization policy |
| Audio infrastructure | Partially implemented | `MessageAudio`, `voice_service.py`, MinIO conventions, existing voice routes | AI read-aloud audio must remain separate from human voice-note storage |
| Notifications | Missing | Audit/event patterns can inform implementation | Requires user-scoped, idempotent notification records |
| Human adviser assignment | Missing | `EntrepreneurProfile` and admin route patterns | Requires active assignment plus reassignment history and access policy |
| Frontend workspaces | Partially implemented | Entrepreneur dashboard, chat, learn, business, admin pages | Adviser and messaging workspaces need authenticated APIs first |
| Migrations | Implemented | Alembic revisions `0001` through `0011` | New tables must be additive and safe for existing demo/guest data |
| Tests | Partial | API, voice, learning, and integration tests | Authorization, object isolation, uploads, notifications, and migrations need coverage |

## Security Baseline Findings

### Blocking findings

1. `apps/api/app/core/config.py` defines `admin_username=admin`, `admin_password=admin123`, and `jwt_secret=change-me-to-a-long-random-string` as runtime defaults. These are unsafe if the application is started without a fully populated environment file.
2. `apps/api/app/core/security.py` authenticates the single configured admin account and emits a role claim, but there is no persisted account identity, password lifecycle, adviser role, entrepreneur role, disabled-account state, or session revocation.
3. `EntrepreneurProfile.user_id` is nullable and has no foreign key to an account table. It cannot safely enforce profile ownership.
4. Existing admin endpoints expose all entrepreneur profiles to any holder of the shared admin cookie. There is no organization scope or permission matrix.
5. The current `Conversation` and `Message` models are explicitly AI-chat models (`role IN ('user','assistant')`) and cannot safely be reused for adviser conversations without weakening their constraints and authorization semantics.

### Required resolution before Task 4.1

The product owner/deployment operator must provide a secure runtime configuration policy:

- no production startup with demo credentials or the placeholder JWT secret;
- secret values supplied through deployment secrets or an explicitly managed local development file;
- an initial super-admin bootstrap procedure that does not create a universal shared password;
- token/session invalidation behavior for disabled users and role changes.

Changing the defaults to arbitrary generated values would not be sufficient because it could strand the current deployment or silently change the existing local login contract. This is therefore an explicit prerequisite decision, not an assumption to make in feature code.

## Baseline Verification

Initial command run from the repository root:

```text
apps/api/.venv/bin/pytest -q
```

Initial result: **36 passed, 4 skipped, 10 failed**. The failure was caused by pytest not selecting `apps/api/pyproject.toml` when invoked from the repository root, despite `pytest-asyncio` being installed in the backend environment.

The corrected baseline command is:

```text
cd /Users/admin/Documents/incomoco/apps/api
.venv/bin/pytest -q
```

Corrected result: **46 passed, 4 skipped in 0.93s**. The four skips are integration tests that require Docker services. `pytest-asyncio` was verified in the active environment at version `1.4.0` and the project `asyncio_mode = "auto"` configuration was selected from `apps/api/pyproject.toml`.

Migration verification after Docker Desktop was opened:

```text
docker compose ps postgres
DATABASE_URL='postgresql+asyncpg://inkomoko:inkomoko@localhost:5433/inkomoko_security_test' .venv/bin/alembic upgrade head
```

Result: **successfully upgraded the disposable `inkomoko_security_test` database through `0012_security_foundation`**. Existing development data was not reset.

## Dependency-Ordered Plan After Blockers

1. Repair the test environment and establish a green baseline.
2. Define and approve account bootstrap, session, organization scope, and reassignment access policy.
3. Add account/role/permission models and server-side authorization dependencies.
4. Add adviser assignment and history with transaction-safe reassignment.
5. Add private human messaging, then private audio notes.
6. Add notifications and adviser-attributed class recommendations.
7. Add adviser/admin workspaces and connect the entrepreneur workspace.
8. Run authorization, migration, upload, audio, and end-to-end tests.

## Explicitly Not Implemented

- No user-management or role tables have been added.
- No assignment, human messaging, audio-note, notification, or recommendation APIs have been added.
- No frontend workspace has been changed.
- No working voice, RAG, learning, or entrepreneur behavior has been replaced.

The account and role tables now exist; the remaining “not implemented” items are the runtime authorization integration and bootstrap/ownership work listed above.

## Decision Needed

The product owner has approved the account/session policy. The schema foundation is now in place, but the task remains open until authentication, ownership enforcement, bootstrap, and their tests are implemented.
