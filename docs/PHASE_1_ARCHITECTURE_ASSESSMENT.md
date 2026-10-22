# Phase 1 Architecture Assessment

The existing application has secure browser-scoped anonymous identity through the `inkomoko_sid` HTTP-only cookie, PostgreSQL-backed `chat_sessions`, conversation ownership by session, explicit multilingual language handling, and admin-only authentication. It does not currently contain a general authenticated-user table, beneficiary table, or entrepreneur profile.

Phase 1 therefore extends the existing guest/session boundary instead of creating a second authentication framework. A profile belongs to one guest session today and has a nullable future `user_id` reference for integration with the real Inkomoko identity provider later. The server derives ownership from the HTTP-only session cookie; clients cannot choose a session or identity ID.

The profile stores lightweight user-stated business context and learning preferences. Beneficiary links are separate, provenance-bearing records and are not exposed through public profile endpoints. No name or phone matching is implemented. A provider protocol plus synthetic fixture demonstrates the future REST, CRM, database, or import integration boundary without using real beneficiary data.

The existing ChatService remains responsible for RAG and generation. A small EntrepreneurContextService resolves the current guest profile and adds a clearly marked, minimal context block to the existing answer prompt. Retrieved documents remain separate, approved grounding data. Incomplete profiles produce no context and preserve existing behavior.

Migration `9d4f2e6b1c77` adds `entrepreneur_profiles` and `beneficiary_links` without modifying existing conversations. A future authenticated-user migration should add a real foreign key only after the account contract is supplied.

Assumptions: the current admin cookie is not an entrepreneur authentication mechanism; registered entrepreneur login is not yet available in this repository; beneficiary synchronization requires explicit authorization and an external data contract; guest-to-registered transfer must be a consented account-linking operation rather than an automatic merge.
