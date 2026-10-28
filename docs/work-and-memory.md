# Work dashboard and customer memory

The shared entrepreneur shell provides a borderless header with My Business/Learn segmented navigation in Work, a globe language menu, and notifications for due to-dos/customer follow-ups. The collapsible sidebar aligns the hamburger, New chat, and Work icons, lists conversation titles without message icons, and anchors the profile control at the bottom. A local-time greeting sits at the left beneath the Work header, with the month picker at the right immediately before the sample flask; duplicate page titles, weekday text, and learning introductions are omitted. On narrow screens, the segmented navigation uses a compact second header row and the sidebar remains accessible from an icon rail. `/work` and `/work/learn` contain My Business and Learn. My Business combines the main dashboard, learning progress and manual records. Existing `/home`, `/my-business`, and `/work/business` links redirect to `/work`; existing lesson URLs remain valid.

## Work records

`GET /api/v1/me/work?month=YYYY-MM&timezone=Africa/Nairobi` returns monthly transactions/totals, all customers and to-dos, and 91 days of activity. The browser sends its timezone. Currency totals stay separate and amounts use database `NUMERIC(14,2)` and decimal strings over the API. Net recorded income is entered income less entered expenses, not an accounting profit assessment.

`POST /me/work/{todos,transactions,customers}`, `PUT /me/work/{collection}/{id}`, and `DELETE /me/work/{collection}/{id}` create, edit, and remove session-owned records. Repeat completion of a to-do adds only one activity event. The activity grid also includes existing completed business actions and lessons. Activity from a completed action remains historical if its underlying manual record is subsequently edited or removed.

The to-do list includes personal tasks and all assigned business actions, including completed assignments. Personal tasks support Assigned, In progress, and Completed; business tasks retain their existing help/status controls and progress counts. Business, This week, and Business actions cards have been removed. Greetings use the linked account display name or demo persona name, never the business name; unnamed guests receive a generic greeting.

The dashboard visualizes monthly income/expenses per currency, task completion across personal and assigned work, learning progress in the selected language, dated customer additions and follow-ups, and 91 days of consistency. Financial summary cards use server ledger totals; chart coordinates use numeric daily aggregates.

The flask toggle previews a complete sample set of money charts, task/learning progress, customers, and consistency, all explicitly labeled Sample. Totals derive from the same sample records as their charts. The editable task list and record tables continue to show real data and are labeled accordingly. Previewing never inserts ledger or customer records. Existing demo-persona learning/actions remain labeled; new manual records and memory use the current browser profile rather than the shared demo persona.

## Memory

Each committed user turn (text, dictation, and live voice) enqueues one durable job, deduplicated by message ID. Regeneration does not enqueue the same message again. The existing worker extracts explicitly stated durable facts asynchronously. Empty extraction leaves the revision unchanged. The fake provider recognizes English `My business name is …` for offline demonstrations; real multilingual extraction uses the configured LLM.

Postgres stores authoritative facts with source message, timestamp, revision, suppression settings, and retry state. A separate worker step writes `customers/{profile_id}/memory.md` to the configured private MinIO bucket. The memory row is locked through upload so older snapshots cannot overwrite newer snapshots. Upload failures retry after a delay; extraction failures use increasing delays and stop after five attempts, with a Retry control in the profile panel. Jobs survive process restarts because claims are transactional row locks rather than in-memory tasks.

Extraction runs without locking the memory row while waiting for the model. The worker re-reads and locks memory before applying results. User corrections use revision checks (stale edits return 409), override automatic extraction, and invalidate older pending work. Forgetting a detail suppresses automatic learning for that category until explicitly edited again. Forget all clears and suppresses all categories. Disabling memory stops new extraction and excludes retained facts from personalization. MinIO updates are eventually consistent; the profile panel shows whether the file is synchronized.

Remembered values are passed to the answer generator as user-stated data, never verification of finances/eligibility or executable instructions. The main chat response does not wait for extraction.

## Running and validation

Apply migrations through `0019` with `alembic upgrade head`, then restart the API and worker. Start the web service with its updated dependencies. CSS uses the same Tailwind PostCSS integration for development and production; `tzdata` supplies IANA zones on Windows.

`pytest tests/test_work_memory.py` covers validation, decimal totals, cross-session isolation, idempotent activity, MinIO snapshots, corrections, forgetting, concurrent edits, slow extraction, and retry recovery. Integration tests use the existing isolated test database and bucket.

Identity currently follows the application's existing browser session cookie. This preserves memory across chats in that browser, not across devices or cleared cookies. Account-based profile linking is a separate identity feature.
