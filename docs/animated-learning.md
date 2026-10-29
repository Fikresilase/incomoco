# Interactive learning courses

Advisers use `/adviser/courses` to upload PDF, DOCX, TXT, or Markdown material, choose a lesson language, monitor preparation, preview lessons, retry failures, and publish a prepared course. Adviser/admin authentication and CSRF protection apply to preparation and publishing. Draft previews are restricted to the author's organization.

The existing ingestion worker also polls `course_preparations`. It extracts the source document, creates a source-grounded course plan, generates Bestie animation instructions and scene narration, and saves the result to learning resources and MinIO. Successful scenes survive retries. Course document uploads enqueue ingestion and course preparation in the same database transaction. Generation runs only in the worker, never when a learner opens a lesson. Plans support up to six lessons per document; extracted documents over 180,000 characters must be split rather than silently truncated.

The renderer, interpreter, animation types, playback helpers, and animator prompt are adapted from [Bestie, commit ab2d0996](https://github.com/Fikresilase/Bestie_/tree/ab2d0996e287fb277e414ae0c6f62a6c1e7e1ee6). HTML scenes run in sandboxed iframes with a restrictive content policy. Generated HTML must implement `window.renderBestieFrame(progress)`, with no independent timers or CSS/SMIL animation, so quiz pauses and seeking freeze the visual state. Invalid output is retried rather than published as a successful lesson. Advisers should preview generated scenes before publishing.

Saved lessons contain scene JSON and a seekable WAV narration file; there is no MP4 render. The models are configured separately from chat:

```
LEARNING_ANIMATION_MODEL=google/gemini-3.8-flash
LEARNING_TTS_MODEL=google/gemini-3.8-flash-lite-tts
LEARNING_DEMO_MODE=true
```

The model calls use the existing OpenRouter configuration. No model substitution or fake audio is used for the demo.

With demo mode enabled, every learner course/lesson link opens the bundled Amharic cash-flow demo in a dialog. It is included in Git as `apps/web/public/learning-demo/amharic/module.json` and `narration.mp3` (about 690 KB total). Anyone pulling the repository gets the complete demo. No AI credentials, database seed, or object storage is needed to play it. Open `/learning/demo` directly, or use the Amharic demo button on My Learning.

The demo has three animated scenes, Amharic narration, and two practice checkpoints. Demo answers and resume progress are saved only in the current browser, separately from graded course progress. Its answer key is intentionally bundled with the public demo; published adviser courses still use server-side answer validation and account progress. Adviser previews always open the selected actual lesson. Set `LEARNING_DEMO_MODE=false` and restart the API to open published lessons individually; the direct demo page remains available.

To regenerate the bundled demo with the configured real models (FFmpeg is included in the API image):

```
docker compose exec api python -m app.workers.bundle_demo --output-dir /tmp/new-amharic-demo
docker cp inkomoko-api-1:/tmp/new-amharic-demo/module.json apps/web/public/learning-demo/amharic/module.json
docker cp inkomoko-api-1:/tmp/new-amharic-demo/narration.mp3 apps/web/public/learning-demo/amharic/narration.mp3
```

Generation writes files directly and does not use a database or object store. Its source is `apps/api/demo/cash-flow.md`. Commit both generated files together; the manifest version resets browser progress when narration is regenerated. The earlier `prepare_demo` command creates the legacy database-backed English demo and is not needed for the bundled player.

For published adviser courses, multiple-choice and true/false questions appear at scene boundaries. Correct answers unlock continuation; incorrect answers permit retries and replay. The server validates answers, limits seeking to the next locked question, and refuses completion until all questions are passed and playback reaches the end. Public course manifests omit correct answers and explanations. Playback position, attempts, passed checkpoints, completion, and version are saved. Signed-in learners resume by account; guests resume with the existing browser session cookie. Publishing a new content version resets playback for that version. The demo never marks the course card that opened it as completed.

Focused checks:

```
cd apps/api
python -m pytest tests/test_animated_learning.py -q
cd ../web
bun run typecheck
node --test features/learning/bundled-demo.test.mjs
```

Visual quality, pronunciation, mobile layouts, and course accuracy require human QA.
