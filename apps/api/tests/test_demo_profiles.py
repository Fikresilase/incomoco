import httpx
import pytest


@pytest.mark.usefixtures("integration_env")
async def test_default_profile_and_selection_persist_without_resetting_persona():
    from app.main import create_app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/demo/profiles")
        assert response.status_code == 200
        assert response.json()["selected"] == "aster"
        assert client.cookies.get("inkomoko_demo_key") == "aster"
        assert len(response.json()["profiles"]) >= 5
        assert (await client.get("/api/v1/me/dashboard")).json()["profile_name"] == "Aster"
        assert (await client.post("/api/v1/demo/login", json={"persona": "hana"})).status_code == 200
        assert (await client.get("/api/v1/demo/profiles")).json()["selected"] == "hana"
        assert (await client.get("/api/v1/me/dashboard")).json()["profile_name"] == "Hana"


@pytest.mark.usefixtures("integration_env")
async def test_original_learning_catalog_remains_and_experimental_routes_are_removed():
    from app.main import create_app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        catalog = await client.get("/api/v1/learning/resources?language=en")
        assert catalog.status_code == 200 and isinstance(catalog.json(), list)
        assert (await client.get("/api/v1/learning/demo-lesson")).status_code == 404
        assert (await client.get("/api/v1/learning/demo-lesson/progress")).status_code == 404
