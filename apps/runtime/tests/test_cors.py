from fastapi.testclient import TestClient

from app.main import app, cors_allow_origins

PROD = "https://bgx-seo-monitor.web.app"
PROD_ALT = "https://bgx-seo-monitor.firebaseapp.com"


def test_cors_allowlist_always_includes_production_and_vite():
    origins = cors_allow_origins("")
    assert PROD in origins
    assert PROD_ALT in origins
    assert "http://localhost:5173" in origins
    assert "http://localhost:5174" in origins


def test_cors_allowlist_merges_comma_separated():
    origins = cors_allow_origins("https://custom.web.app, http://localhost:9999")
    assert "https://custom.web.app" in origins
    assert "http://localhost:9999" in origins
    assert PROD in origins


def test_health_allows_production_origin():
    with TestClient(app) as client:
        res = client.get("/api/health", headers={"Origin": PROD})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == PROD


def test_preflight_get_and_put_with_auth_headers():
    with TestClient(app) as client:
        sites = client.options(
            "/api/sites",
            headers={
                "Origin": PROD,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        schedule = client.options(
            "/api/schedule",
            headers={
                "Origin": PROD_ALT,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
    assert sites.status_code == 200
    assert sites.headers.get("access-control-allow-origin") == PROD
    assert schedule.status_code == 200
    assert schedule.headers.get("access-control-allow-origin") == PROD_ALT


def test_private_network_preflight():
    with TestClient(app) as client:
        res = client.options(
            "/api/health",
            headers={
                "Origin": PROD,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Private-Network": "true",
            },
        )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == PROD
    assert res.headers.get("access-control-allow-private-network") == "true"
