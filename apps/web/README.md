# Inkomoko Assistant — web

Next.js 16 (App Router, Bun) frontend for the bilingual (English/Amharic) Inkomoko Assistant:
chat with streaming answers and citations, dictation, live talk, and the admin dashboard.

## Run

```bash
bun install
cp .env.example .env.local   # optional; defaults to http://localhost:8000
bun run dev                  # http://localhost:3000
```

Or via Docker Compose from the repo root (`docker compose up`), which builds `apps/web/Dockerfile`.

| Script | What it does |
|---|---|
| `bun run dev` / `bun run build` | Copy VAD/onnxruntime assets into `public/vad`, then start/build Next.js |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |

- **API:** `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`); every call goes to `/api/v1` with `credentials: "include"`. The contract is `docs/api-contract.md`.
- **Routes:** `/` chat · `/admin/login` · `/admin` overview · `/admin/documents` knowledge base.
- **Layout:** `app/` (thin routes) → `features/{chat,voice,documents,analytics,auth}` (features never import each other) → `components/` + `lib/{api,audio,i18n}`.
- **Mic access** needs `localhost` or HTTPS.
