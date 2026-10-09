"""End-to-end: admin → upload → worker ingestion → chat (SSE) → feedback → read-aloud → analytics
→ delete → live talk over WebSocket. Real Postgres/Weaviate/MinIO, offline AI adapters."""

import io
import json
import wave

import httpx
import pytest

pytestmark = pytest.mark.usefixtures("integration_env")

GUIDE = """# Inkomoko Services Guide

## Business Training
Inkomoko provides business training for entrepreneurs. The training covers bookkeeping, marketing,
and business planning. Sessions run in small groups and are offered in several languages.

## Access to Finance
Inkomoko offers loans to small and growing businesses. Loan officers assess each business plan and
cash flow before approving a loan. Repayment schedules are flexible and adapted to the business.

## ብድር አገልግሎት
ኢንኮሞኮ ለአነስተኛ ንግዶች ብድር ይሰጣል። የብድር ባለሙያዎች የንግድ እቅዱን ይገመግማሉ።

## Contact
Visit the nearest Inkomoko office or call the support line for more information.
"""


def wav_bytes(seconds: float = 0.5) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * int(16000 * seconds))
    return buffer.getvalue()


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        events.append((lines["event"], json.loads(lines["data"])))
    return events


async def drain_worker(app) -> None:
    from app.workers.ingest_worker import IngestionWorker

    worker = IngestionWorker(app.state.container)
    while await worker.run_once():
        pass


async def test_full_flow():
    from app.main import app

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # --- admin auth
            assert (await client.get("/api/v1/admin/me")).status_code == 401
            bad = await client.post("/api/v1/admin/login", json={"username": "admin", "password": "nope"})
            assert bad.status_code == 401
            ok = await client.post("/api/v1/admin/login", json={"username": "admin", "password": "admin123"})
            assert ok.status_code == 200
            assert (await client.get("/api/v1/admin/me")).json() == {"username": "admin"}

            # --- upload validation + ingestion
            bad_type = await client.post(
                "/api/v1/admin/documents", files={"file": ("x.exe", b"MZ", "application/octet-stream")}
            )
            assert bad_type.status_code == 415
            up = await client.post(
                "/api/v1/admin/documents",
                files={"file": ("services_guide.md", GUIDE.encode(), "text/markdown")},
            )
            assert up.status_code == 202, up.text
            doc = up.json()
            assert doc["status"] == "queued" and doc["title"] == "services guide"
            dup = await client.post(
                "/api/v1/admin/documents", files={"file": ("again.md", GUIDE.encode(), "text/markdown")}
            )
            assert dup.status_code == 409

            await drain_worker(app)
            doc = (await client.get(f"/api/v1/admin/documents/{doc['id']}")).json()
            assert doc["status"] == "ready", doc
            assert doc["chunk_count"] >= 2
            assert doc["lang"] in ("en", "mixed")
            listing = (await client.get("/api/v1/admin/documents", params={"q": "guide"})).json()
            assert listing["total"] == 1

            # --- chat over SSE
            resp = await client.post(
                "/api/v1/chat", json={"message": "What business training does Inkomoko provide?"}
            )
            assert resp.status_code == 200
            events = parse_sse(resp.text)
            names = [e for e, _ in events]
            assert names[0] == "start" and names[1] == "sources" and names[-1] == "done"
            assert "delta" in names
            start = events[0][1]
            sources = events[1][1]["sources"]
            assert sources and sources[0]["title"] == "services guide"
            assert "Inkomoko Services Guide" in sources[0]["breadcrumb"]
            done = events[-1][1]
            assert done["no_answer"] is False
            conversation_id = start["conversation_id"]
            assistant_id = start["assistant_message_id"]

            # follow-up in the same conversation, Amharic
            resp = await client.post(
                "/api/v1/chat", json={"message": "ኢንኮሞኮ ብድር ይሰጣል?", "conversation_id": conversation_id}
            )
            assert parse_sse(resp.text)[0][1]["lang"] == "am"

            # --- history
            convs = (await client.get("/api/v1/conversations")).json()
            assert [c["id"] for c in convs] == [conversation_id]
            conv = (await client.get(f"/api/v1/conversations/{conversation_id}")).json()
            assert [m["role"] for m in conv["messages"]] == ["user", "assistant", "user", "assistant"]
            assert conv["messages"][1]["sources"]

            # --- feedback, regenerate
            fb = await client.post(f"/api/v1/messages/{assistant_id}/feedback", json={"rating": 1})
            assert fb.status_code == 204
            regen = await client.post(
                "/api/v1/chat", json={"regenerate": True, "conversation_id": conversation_id}
            )
            assert parse_sse(regen.text)[-1][0] == "done"
            conv = (await client.get(f"/api/v1/conversations/{conversation_id}")).json()
            assert len(conv["messages"]) == 4

            # --- read aloud: generated once, then replayed from MinIO
            first = await client.post("/api/v1/voice/speak", json={"message_id": assistant_id})
            assert first.status_code == 200 and first.headers["content-type"] == "audio/wav"
            conv = (await client.get(f"/api/v1/conversations/{conversation_id}")).json()
            assert conv["messages"][1]["has_audio"] is True
            again = await client.post("/api/v1/voice/speak", json={"message_id": assistant_id})
            assert again.content == first.content

            # --- dictation
            tr = await client.post(
                "/api/v1/voice/transcribe", files={"audio": ("a.wav", wav_bytes(), "audio/wav")}
            )
            assert tr.status_code == 200 and tr.json()["text"]

            # --- analytics
            summary = (await client.get("/api/v1/admin/analytics/summary", params={"days": 7})).json()
            assert summary["kpis"]["messages"] >= 4
            assert summary["kpis"]["documents_ready"] == 1
            assert summary["kpis"]["feedback_positive_rate"] == 1.0
            assert summary["languages"]["am"] >= 1
            assert summary["top_documents"][0]["title"] == "services guide"
            assert len(summary["timeseries"]) >= 7
            gaps = await client.post("/api/v1/admin/analytics/gaps/refresh")
            assert gaps.status_code == 200 and "topics" in gaps.json()

            # --- delete: leaves retrieval immediately, then storage is cleaned
            deleted = await client.delete(f"/api/v1/admin/documents/{doc['id']}")
            assert deleted.status_code == 202 and deleted.json()["status"] == "deleting"
            resp = await client.post(
                "/api/v1/chat", json={"message": "What business training does Inkomoko provide?"}
            )
            events = parse_sse(resp.text)
            assert events[1][1]["sources"] == []
            assert events[-1][1]["no_answer"] is True
            await drain_worker(app)
            assert (await client.get(f"/api/v1/admin/documents/{doc['id']}")).json()["status"] == "deleted"
            # old citations still display after deletion
            conv = (await client.get(f"/api/v1/conversations/{conversation_id}")).json()
            assert conv["messages"][1]["sources"]

            # --- conversation delete
            assert (await client.delete(f"/api/v1/conversations/{conversation_id}")).status_code == 204


async def test_text_small_talk_is_answered_directly_without_search():
    from app.main import app

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/chat", json={"message": "Hello, how are you?"})
            events = parse_sse(resp.text)
            assert [e for e, _ in events] == ["start", "sources", "delta", "done"]
            assert events[1][1]["sources"] == []
            assert events[2][1]["text"] == "Hi! I am doing well, thanks for asking."
            assert events[3][1]["no_answer"] is False

            conversation_id = events[0][1]["conversation_id"]
            conv = (await client.get(f"/api/v1/conversations/{conversation_id}")).json()
            assistant = conv["messages"][1]
            assert (
                assistant["content"] == "Hi! I am doing well, thanks for asking."
                and assistant["sources"] == []
            )

            # A follow-up information question in the same chat still goes through the search.
            resp = await client.post(
                "/api/v1/chat",
                json={"message": "What loans does Inkomoko offer?", "conversation_id": conversation_id},
            )
            assert [e for e, _ in parse_sse(resp.text)][-1] == "done"


def _live_turn(ws, audio: bytes) -> tuple[list[dict], int]:
    ws.send_bytes(audio)
    events, audio_frames = [], 0
    while True:
        message = ws.receive()
        if message.get("bytes") is not None:
            audio_frames += 1
            continue
        event = json.loads(message["text"])
        events.append(event)
        if event["type"] in ("turn.done", "error"):
            return events, audio_frames


def test_live_talk_websocket():
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import app

    with TestClient(app) as client:
        client.get("/health")  # receive the session cookie first, like the browser does

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/api/v1/voice/live", headers={"origin": "https://evil.example"}
            ) as ws:
                ws.receive_json()

        with client.websocket_connect("/api/v1/voice/live") as ws:
            ws.send_json({"type": "session.start", "conversation_id": None})
            assert ws.receive_json()["type"] == "session.ready"

            # Information question: spoken acknowledgement first, then the searched answer.
            events, audio_frames = _live_turn(ws, wav_bytes(0.5))
            types = [e["type"] for e in events]
            assert types[0] == "user.transcript"
            deltas = [e["text"] for e in events if e["type"] == "agent.text.delta"]
            assert deltas[0].startswith("Good question")  # the acknowledgement comes first
            assert "agent.sources" in types and types[-1] == "turn.done"
            assert audio_frames == types.count("agent.audio") >= 2

            # Small talk: answered directly, no document search.
            events, audio_frames = _live_turn(ws, wav_bytes(2.5))
            types = [e["type"] for e in events]
            assert "agent.sources" not in types
            assert [e["text"] for e in events if e["type"] == "agent.text.delta"] == [
                "Hi! I am doing well, thanks for asking."
            ]
            assert audio_frames == 1 and types[-1] == "turn.done"
            ws.send_json({"type": "session.end"})

        conversations = client.get("/api/v1/conversations").json()
        assert conversations and conversations[0]["title"] == "What services does Inkomoko offer?"
        conv = client.get(f"/api/v1/conversations/{conversations[0]['id']}").json()
        messages = conv["messages"]
        assert [m["modality"] for m in messages] == ["voice"] * 4
        assert not messages[1]["content"].startswith(
            "Good question"
        )  # acknowledgement isn't saved as the answer
        assert messages[3]["content"] == "Hi! I am doing well, thanks for asking."
        assert messages[1]["has_audio"] and messages[3]["has_audio"]


def test_amharic_keyword_search_and_exact_id_filter():
    """BM25 must match Amharic words and spelling variants; filters must match IDs exactly."""
    import uuid

    from app.adapters.weaviate.vector_store import WeaviateVectorStore
    from app.core.config import get_settings
    from app.domain.models import ChunkRecord
    from app.rag.ingestion.normalizer import normalize_for_search

    store = WeaviateVectorStore(get_settings())
    store.ensure_schema("fake")
    texts = {
        "a": "ኢንኮሞኮ ለአነስተኛ ንግዶች ብድር ይሰጣል። ባለሙያዎች ሀሳብ ይገመግማሉ።",
        "b": "Business training for entrepreneurs.",
    }
    records = [
        ChunkRecord(
            id=str(uuid.uuid4()),
            document_id=doc_id,
            chunk_index=0,
            title=doc_id,
            breadcrumb=doc_id,
            text=text,
            context="",
            search_text=normalize_for_search(text),
            lang="am",
            page_start=None,
            page_end=None,
        )
        for doc_id, text in texts.items()
    ]
    try:
        dim = 256  # same dimension as the fake embedder used by the other tests
        store.insert_chunks(records, [[1.0] + [0.0] * (dim - 1), [0.0, 1.0] + [0.0] * (dim - 2)])

        def keyword_hits(query: str) -> list[str]:
            hits = store.hybrid_search(
                normalize_for_search(query),
                [0.5, 0.5] + [0.0] * 254,
                alpha=0.0,
                limit=5,
                document_ids=["a", "b"],
            )
            return [h.document_id for h in hits]

        assert keyword_hits("ብድር") == ["a"]
        assert keyword_hits("ሐሳብ") == ["a"]  # homophone spelling of ሀሳብ
        assert keyword_hits("TRAINING?") == ["b"]
    finally:
        store.delete_document("a")
        store.delete_document("b")
        store.close()
