"""Phase 4E regression checks executed inside the Docker service network."""

import httpx
import pytest

pytestmark = pytest.mark.usefixtures("integration_env")


async def test_private_human_routes_require_persisted_auth():
    from app.main import app

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            for path in (
                "/api/v1/admin/mvp-overview",
                "/api/v1/human/assignments",
                "/api/v1/human/notifications",
                "/api/v1/human/conversations/unread-count",
                "/api/v1/human/admin/advisers",
            ):
                response = await client.get(path)
                assert response.status_code == 401, (path, response.text)


async def test_private_mutation_rejects_missing_csrf_before_object_access():
    from app.main import app

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/human/conversations/00000000-0000-0000-0000-000000000000/read"
            )
            assert response.status_code == 403
