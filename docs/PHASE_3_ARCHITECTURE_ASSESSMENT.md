# Phase 3 Architecture Assessment

## Reusable foundation

The application already has cookie-backed guest sessions, `EntrepreneurProfile`, explicit language selection, learning skills/resources with approval filtering, deterministic learning recommendations, chat/RAG context injection, admin-cookie authentication, analytics, and provider-independent TTS. Phase 3 should extend these services rather than create a second identity, RAG, or voice system.

## Proposed extensions

Add `BusinessGoal`, `BusinessAction`, `LearningProgress`, and `SkillEvidence`, all owned by an entrepreneur profile. Evidence is structured only: lesson completion, practice result, self-report, completed action, adviser observation, or conversation signal. Knowledge status is derived deterministically from counts and completion state; no hidden reasoning or arbitrary score is stored.

The next-best-action service ranks at most three actions: high-priority open problems, active goals, evidence-backed knowledge gaps, practice gaps, unfinished relevant lessons, follow-ups, and explicit adviser requests. The server validates every skill and action type. LLM output may explain a selected action but never selects its type, status, or skill.

## Demo identity

Synthetic profiles are seeded with `is_demo=true` and selected through a server-owned demo cookie. The browser submits only a persona key; the API resolves that key to a profile and rotates the demo session cookie. IDs are never trusted from the client for ownership. This is a replaceable adapter for future real beneficiary authentication.

## UX and admin

`/home` is a simple dashboard with one primary priority, unfinished learning, one practical action, and an adviser CTA. `/chat` remains available and receives server-side profile/goal/action context. Admin views expose structured entrepreneur status, evidence, actions, and attention triggers without private chain-of-thought or unsupported financial claims.

## Security and migration

Public dashboard reads are limited to the current session profile. Admin lists require `AdminUser`. Demo data is visibly marked and never mixed into real beneficiary reporting without an explicit filter. The migration is additive and seeds only synthetic records; approved content remains the source of truth for lessons.

## Language and voice

All dashboard labels use the existing locale system. Amharic is first-class: daily priority, lesson text, adviser responses, and suggestions continue using the existing read-aloud/TTS cache path. Oromo and Somali remain conditional until separately validated.
