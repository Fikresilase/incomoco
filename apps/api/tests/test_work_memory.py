import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.schemas.work import CustomerIn, TodoIn, TransactionIn
from app.services.memory import apply_updates, parse_updates


def test_work_input_validation_and_exact_money():
    valid = {
        "kind": "income",
        "amount": "123456789.01",
        "currency": "ETB",
        "description": " Sale ",
        "occurred_on": "2026-10-28",
    }
    parsed = TransactionIn(**valid)
    assert str(parsed.amount) == "123456789.01"
    assert parsed.description == "Sale"
    for changes in (
        {"amount": "-1"},
        {"amount": "0"},
        {"amount": "1.001"},
        {"amount": "NaN"},
        {"currency": "etb"},
        {"description": " "},
        {"occurred_on": "bad"},
    ):
        with pytest.raises(ValidationError):
            TransactionIn(**(valid | changes))
    with pytest.raises(ValidationError):
        TodoIn(title=" ")
    with pytest.raises(ValidationError):
        CustomerIn(name=" ")


def test_memory_extraction_boundaries_and_corrections():
    now = datetime.now(UTC)
    facts = apply_updates({}, [], parse_updates('{"business_name":"Cedar"}'), uuid.uuid4(), now)
    assert facts["business_name"]["value"] == "Cedar"
    assert apply_updates(facts, [], {"business_name": "Old"}, uuid.uuid4(), now - timedelta(days=1)) == facts
    assert apply_updates(facts, ["business_name"], {"business_name": "Other"}, uuid.uuid4(), now) == facts
    corrected = {
        "business_name": {"value": "Corrected", "source": "user_edit", "updated_at": now.isoformat()}
    }
    assert apply_updates(corrected, [], {"business_name": "Other"}, uuid.uuid4(), now) == corrected
    assert parse_updates("```json\n{}\n```") == {}
    for invalid in ("[]", '{"password":"secret"}', '{"business_name":42}', "not json"):
        with pytest.raises((ValueError, TypeError)):
            parse_updates(invalid)


@pytest.mark.usefixtures("integration_env")
async def test_work_records_are_private_exact_and_activity_is_idempotent():
    from app.main import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://test") as a,
        httpx.AsyncClient(transport=transport, base_url="http://test") as b,
    ):
        await a.post("/api/v1/guest/session")
        await b.post("/api/v1/guest/session")
        today = datetime.now(UTC).date().isoformat()
        tx = {
            "kind": "income",
            "amount": "100.10",
            "currency": "ETB",
            "description": "Sale",
            "occurred_on": today,
        }
        created = await a.post("/api/v1/me/work/transactions", json=tx)
        assert created.status_code == 201, created.text
        txid = created.json()["id"]
        await a.post("/api/v1/me/work/transactions", json=tx | {"amount": "0.20"})
        await a.post("/api/v1/me/work/transactions", json=tx | {"amount": "30.05", "kind": "expense"})
        await a.post("/api/v1/me/work/transactions", json=tx | {"amount": "5.00", "currency": "USD"})
        customer = (
            await a.post("/api/v1/me/work/customers", json={"name": "Aster", "follow_up_on": today})
        ).json()
        todo = (await a.post("/api/v1/me/work/todos", json={"title": "Call Aster", "due_date": today})).json()
        completed = {"title": "Call Aster", "due_date": today, "completed": True}
        await a.put(f"/api/v1/me/work/todos/{todo['id']}", json=completed)
        first = (await a.get("/api/v1/me/work")).json()
        await a.put(f"/api/v1/me/work/todos/{todo['id']}", json=completed)
        second = (await a.get("/api/v1/me/work")).json()
        assert first["activity"] == second["activity"]
        assert float(second["totals"]["ETB"]["income"]) == 100.30
        assert float(second["totals"]["ETB"]["expense"]) == 30.05
        assert float(second["totals"]["USD"]["income"]) == 5
        assert second["customer_count"] == 1
        for collection, rowid, body in (
            ("transactions", txid, tx),
            ("customers", customer["id"], {"name": "Intruder"}),
            ("todos", todo["id"], completed),
        ):
            assert (await b.put(f"/api/v1/me/work/{collection}/{rowid}", json=body)).status_code == 404
            assert (await b.delete(f"/api/v1/me/work/{collection}/{rowid}")).status_code == 404
        assert (await b.get("/api/v1/me/work")).json()["transactions"] == []
        assert (await a.get("/api/v1/me/work?month=invalid")).status_code == 422
        assert (await a.get("/api/v1/me/work?timezone=Invalid/Place")).status_code == 422
        assert (
            await a.put(f"/api/v1/me/work/transactions/{txid}", json=tx | {"amount": "200.00"})
        ).status_code == 200
        assert (await a.delete(f"/api/v1/me/work/transactions/{txid}")).status_code == 204
        assert (await a.delete(f"/api/v1/me/work/customers/{customer['id']}")).status_code == 204
        assert (await a.delete(f"/api/v1/me/work/todos/{todo['id']}")).status_code == 204


@pytest.mark.usefixtures("integration_env")
async def test_memory_queue_concurrency_corrections_forgetting_and_minio():
    from app.adapters.fake.adapters import FakeLLM
    from app.adapters.minio.blob_store import MinioBlobStore
    from app.core.config import get_settings
    from app.core.db import SessionFactory
    from app.core.security import SESSION_COOKIE
    from app.main import create_app
    from app.repositories.orm import CustomerMemory, MemoryJob
    from app.services.chat_service import ChatService
    from app.services.entrepreneur import EntrepreneurContextService
    from app.services.memory import MemoryWorker

    blobs = MinioBlobStore(get_settings())
    blobs.ensure_bucket()
    container = SimpleNamespace(llm=FakeLLM(), blob_store=blobs)
    worker = MemoryWorker(container)
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        profile = (await client.post("/api/v1/guest/session")).json()["profile"]
        session_id = uuid.UUID(client.cookies.get(SESSION_COOKIE))

        async def turn(text):
            async with SessionFactory() as db:
                return await ChatService(container).start_turn(
                    db, session_id, message=text, conversation_id=None, modality="text", lang="en"
                )

        await turn("My business name is Cedar")
        await worker.run_once()
        learned = (await client.get("/api/v1/me/memory")).json()
        assert learned["facts"]["business_name"]["value"] == "Cedar"
        async with SessionFactory() as db:
            context = await EntrepreneurContextService().context_for_guest(db, session_id)
            assert "Cedar" in context.to_prompt()
        await worker.run_once()
        snapshot = blobs.get(f"customers/{profile['id']}/memory.md").decode()
        assert "Cedar" in snapshot
        # Both revisions start from the same version: exactly one correction can win.
        edits = await asyncio.gather(
            *[
                client.patch(
                    "/api/v1/me/memory",
                    json={"revision": learned["revision"], "key": "business_name", "value": name},
                )
                for name in ("Corrected A", "Corrected B")
            ]
        )
        assert sorted(r.status_code for r in edits) == [200, 409]
        corrected = (await client.get("/api/v1/me/memory")).json()
        await turn("My business name is Wrong")
        await asyncio.gather(worker.run_once(), MemoryWorker(container).run_once())
        assert (await client.get("/api/v1/me/memory")).json()["facts"] == corrected["facts"]
        await turn("My business name is Queued before forgetting")
        forgotten = await client.patch(
            "/api/v1/me/memory", json={"revision": corrected["revision"], "forget_all": True}
        )
        assert forgotten.status_code == 200
        await worker.run_once()
        await turn("My business name is Still forgotten")
        await worker.run_once()
        assert (await client.get("/api/v1/me/memory")).json()["facts"] == {}
        await worker.run_once()
        assert "Cedar" not in blobs.get(f"customers/{profile['id']}/memory.md").decode()
        current = (await client.get("/api/v1/me/memory")).json()
        disabled = await client.patch(
            "/api/v1/me/memory", json={"revision": current["revision"], "enabled": False}
        )
        assert disabled.status_code == 200
        await turn("My business name is Disabled")
        async with SessionFactory() as db:
            assert (
                await db.scalar(select(MemoryJob).where(MemoryJob.profile_id == uuid.UUID(profile["id"])))
                is None
            )
            memory = await db.get(CustomerMemory, uuid.UUID(profile["id"]))
            assert memory.enabled is False


@pytest.mark.usefixtures("integration_env")
async def test_memory_failures_are_retried_without_losing_jobs():
    from app.adapters.fake.adapters import FakeLLM
    from app.adapters.minio.blob_store import MinioBlobStore
    from app.core.config import get_settings
    from app.core.db import SessionFactory
    from app.core.security import SESSION_COOKIE
    from app.main import create_app
    from app.repositories.orm import CustomerMemory, MemoryJob
    from app.services.chat_service import ChatService
    from app.services.memory import MemoryWorker

    class InvalidLLM:
        async def complete(self, *args, **kwargs):
            return "invalid JSON"

    class UnavailableStorage:
        def put(self, *args):
            raise OSError("offline")

    blobs = MinioBlobStore(get_settings())
    blobs.ensure_bucket()
    good = SimpleNamespace(llm=FakeLLM(), blob_store=blobs)
    while await MemoryWorker(good).run_once():
        pass
    bad = SimpleNamespace(llm=InvalidLLM(), blob_store=UnavailableStorage())
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        profile = (await client.post("/api/v1/guest/session")).json()["profile"]
        profile_id = uuid.UUID(profile["id"])
        async with SessionFactory() as db:
            ctx = await ChatService(good).start_turn(
                db,
                uuid.UUID(client.cookies.get(SESSION_COOKIE)),
                message="My business name is Recovered",
                conversation_id=None,
                modality="voice",
                lang="en",
            )
        await MemoryWorker(bad).run_once()
        async with SessionFactory() as db:
            job = await db.get(MemoryJob, ctx.user_message_id)
            assert job.attempts == 1
            assert job.available_at > datetime.now(UTC)
            memory = await db.get(CustomerMemory, profile_id)
            assert memory.synced_revision != memory.revision
            assert memory.next_sync_at is not None
            job.attempts = 5
            await db.commit()
        assert (await client.get("/api/v1/me/memory")).json()["failed"] == 1
        assert (await client.post("/api/v1/me/memory/retry")).status_code == 204
        await MemoryWorker(good).run_once()
        memory = (await client.get("/api/v1/me/memory")).json()
        assert memory["facts"]["business_name"]["value"] == "Recovered"
        assert memory["pending"] == 0
        await MemoryWorker(good).run_once()
        assert "Recovered" in blobs.get(f"customers/{profile_id}/memory.md").decode()


@pytest.mark.usefixtures("integration_env")
async def test_correction_does_not_wait_for_slow_extraction():
    from app.adapters.fake.adapters import FakeLLM
    from app.adapters.minio.blob_store import MinioBlobStore
    from app.core.config import get_settings
    from app.core.db import SessionFactory
    from app.core.security import SESSION_COOKIE
    from app.main import create_app
    from app.services.chat_service import ChatService
    from app.services.memory import MemoryWorker

    started, release = asyncio.Event(), asyncio.Event()

    class SlowLLM(FakeLLM):
        async def complete(self, *args, **kwargs):
            started.set()
            await release.wait()
            return '{"business_name":"Stale extraction"}'

    blobs = MinioBlobStore(get_settings())
    blobs.ensure_bucket()
    normal = SimpleNamespace(llm=FakeLLM(), blob_store=blobs)
    while await MemoryWorker(normal).run_once():
        pass
    container = SimpleNamespace(llm=SlowLLM(), blob_store=blobs)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        await client.post("/api/v1/guest/session")
        async with SessionFactory() as db:
            await ChatService(normal).start_turn(
                db,
                uuid.UUID(client.cookies.get(SESSION_COOKIE)),
                message="My business name is Before",
                conversation_id=None,
                modality="text",
                lang="en",
            )
        task = asyncio.create_task(MemoryWorker(container).run_once())
        try:
            await asyncio.wait_for(started.wait(), timeout=5)
            current = (await client.get("/api/v1/me/memory")).json()
            edited = await asyncio.wait_for(
                client.patch(
                    "/api/v1/me/memory",
                    json={"revision": current["revision"], "key": "business_name", "value": "Correct now"},
                ),
                timeout=2,
            )
            assert edited.status_code == 200
        finally:
            release.set()
            await task
        assert (await client.get("/api/v1/me/memory")).json()["facts"]["business_name"][
            "value"
        ] == "Correct now"


@pytest.mark.usefixtures("integration_env")
async def test_unified_tasks_keep_progress_and_dashboard_uses_person_name():
    from app.core.db import SessionFactory
    from app.main import create_app
    from app.repositories.orm import BusinessAction

    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        profile = (await client.post("/api/v1/guest/session")).json()["profile"]
        # A business name must not be presented as the person's name.
        await client.patch("/api/v1/me/entrepreneur-profile", json={"business_name": "Aster Beauty Salon"})
        assert (await client.get("/api/v1/me/dashboard")).json()["profile_name"] == ""
        task = (await client.post("/api/v1/me/work/todos", json={"title": "Call supplier"})).json()
        assert task["started_at"] is None and task["completed_at"] is None
        active = await client.put(
            f"/api/v1/me/work/todos/{task['id']}", json={"title": "Call supplier", "status": "in_progress"}
        )
        assert active.status_code == 200
        assert active.json()["started_at"] is not None
        assert active.json()["completed_at"] is None
        finished = await client.put(
            f"/api/v1/me/work/todos/{task['id']}", json={"title": "Call supplier", "status": "completed"}
        )
        assert finished.json()["completed_at"] is not None
        reopened = await client.put(
            f"/api/v1/me/work/todos/{task['id']}", json={"title": "Call supplier", "status": "assigned"}
        )
        assert reopened.json()["completed_at"] is None and reopened.json()["started_at"] is None
        invalid = await client.put(
            f"/api/v1/me/work/todos/{task['id']}", json={"title": "Call supplier", "status": "assessed"}
        )
        assert invalid.status_code == 422
        async with SessionFactory() as db:
            for index in range(4):
                db.add(
                    BusinessAction(
                        profile_id=uuid.UUID(profile["id"]),
                        title=f"Assigned task {index}",
                        description="Existing assignment",
                        status="recommended",
                        target_count=3,
                        progress_count=1,
                    )
                )
            await db.commit()
        tasks = (await client.get("/api/v1/me/actions")).json()
        assert len(tasks) == 4
        action_id = tasks[0]["id"]
        assert tasks[0]["progress_count"] == 1
        started = await client.post(f"/api/v1/me/actions/{action_id}/start")
        assert started.json()["status"] == "started"
        finished = await client.post(f"/api/v1/me/actions/{action_id}/complete")
        assert finished.json()["status"] == "completed"
        assert any(
            task["id"] == action_id and task["status"] == "completed"
            for task in (await client.get("/api/v1/me/actions")).json()
        )
        demo = await client.post("/api/v1/demo/login", json={"persona": "aster"})
        assert demo.status_code == 200, demo.text
        assert demo.json()["profile_name"] == "Aster"
        assert demo.json()["business_name"] == "Aster Beauty Salon"
