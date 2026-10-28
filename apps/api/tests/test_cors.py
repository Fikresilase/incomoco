import pytest
from fastapi.testclient import TestClient

from app import main
from app.core.config import Settings


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    settings = Settings(_env_file=None)
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    # No lifespan: CORS and health checks do not require infrastructure or AI adapters.
    return TestClient(main.create_app())


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://localhost:3001"])
@pytest.mark.parametrize(
    ("path", "method"),
    [("/api/v1/me/dashboard", "GET"), ("/api/v1/voice/transcribe", "POST")],
)
def test_browser_preflight_allows_local_frontends(client, origin, path, method):
    response = client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


def test_actual_response_allows_session_cookie(client):
    origin = "http://localhost:3001"
    response = client.get("/health", headers={"Origin": origin})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "inkomoko_sid" in response.cookies


def test_browser_preflight_rejects_unconfigured_site(client):
    response = client.options(
        "/api/v1/voice/transcribe",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_explicit_origins_override_local_defaults(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    settings = Settings(_env_file=None)
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    client = TestClient(main.create_app())
    for origin, expected in [("https://app.example.com", 200), ("http://localhost:3001", 400)]:
        response = client.options(
            "/api/v1/me/dashboard",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )
        assert response.status_code == expected
