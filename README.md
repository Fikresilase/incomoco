# Inkomoko Assistant

A bilingual (**Amharic + English**) AI assistant for Inkomoko. It has three parts:
- **Chat:** a ChatGPT-style chat with text, dictation, and live voice conversation.
- **Admin dashboard:** analytics and knowledge-base document management.
- **RAG pipeline:** HyDE, then Weaviate hybrid search, then rerank, then grounded generation.

> Demo application. Design and decisions: [design_and_architecture.md](design_and_architecture.md) · API: [docs/api-contract.md](docs/api-contract.md)

## Quick start (Docker only)

```bash
cp .env.example .env          # then set OPENROUTER_API_KEY in .env
docker compose up --build
```

| What | URL |
|---|---|
| Chat | http://localhost:3000 |
| Admin | http://localhost:3000/admin (demo login **admin / admin123**) |
| API docs (Swagger) | http://localhost:8000/docs |
| MinIO console | http://localhost:9011 |

Everything (web, API, streamed chat, live talk) goes through one address, so the app also works on phones and other devices through an HTTPS tunnel. See [docs/remote-access.md](docs/remote-access.md).

- **No API key yet?** Set `AI_PROVIDER=fake` in `.env`. Everything runs offline with canned answers, which is useful for UI work.
- **Port clash?** Every host port is configurable in `.env` (`WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, …).

> ⚠️ `admin/admin123` is for the demo only. Change `ADMIN_PASSWORD` and `JWT_SECRET` before any shared or hosted deployment.

## What runs

| Service | Role |
|---|---|
| `proxy` | nginx: the single entry point on port 3000 (web app, API, WebSockets) |
| `web` | Next.js 16 (Bun): chat and admin UI, with hot reload |
| `api` | FastAPI: REST, SSE chat streaming, WebSocket live talk, with hot reload |
| `worker` | Ingestion jobs (PDF via Gemini vision → Markdown → structure-aware chunks → contextual retrieval → embeddings → Weaviate) and the hourly knowledge-gap report |
| `postgres` | App data plus the ingestion job queue (11 tables) |
| `weaviate` | Chunks, vectors, and the BM25 index |
| `minio` | Uploaded files and generated speech |

All AI calls go through **OpenRouter**:

| Role | Model |
|---|---|
| HyDE, answers, PDF vision, speech-to-text, contextual retrieval | `google/gemini-3.5-flash-lite` |
| Text-to-speech | `google/gemini-3.8-flash-lite-tts` |
| Embeddings | `google/gemini-embedding-2` |
| Rerank | `cohere/rerank-4-fast` |

Model IDs and RAG tuning live in `.env`, not in code.

## Repository layout

```
apps/
  web/   Next.js (Bun): app/ routes → features/{chat,voice,documents,analytics,auth} → lib/, components/ui/
  api/   FastAPI (uv):  api/v1 routers → services → rag/ pipeline → domain/ports ← adapters/{openrouter,weaviate,minio,fake}
docs/    API contract
docker-compose.yml
```

## Development

Backend tests: unit tests plus end-to-end integration tests against the Compose infrastructure, using offline AI adapters and an isolated test database, bucket, and collection.

```bash
docker compose up -d postgres weaviate minio
cd apps/api && uv sync && uv run pytest
```

Frontend checks:

```bash
cd apps/web && bun install && bun run lint && bun run build
```

Database migrations (Alembic) run automatically when the `api` container starts. To create a new one after changing `app/repositories/orm.py`:

```bash
cd apps/api && DATABASE_URL=postgresql+asyncpg://inkomoko:inkomoko@localhost:5433/inkomoko uv run alembic revision --autogenerate -m "describe change"
```

---
*AI-assisted draft. Review before sharing externally.*
