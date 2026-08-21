from fastapi.testclient import TestClient

from app.main import app


def test_health_ok(monkeypatch):
    monkeypatch.setenv("ORG_ID", "logicbus-org-abcdef")
    with TestClient(app) as client:
        res = client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["queue"] is True
        assert body["js"] is True
        assert body["org_id_suffix"] == "abcdef"
        assert "version" in body


def test_health_hides_short_org(monkeypatch):
    monkeypatch.setenv("ORG_ID", "ab")
    with TestClient(app) as client:
        body = client.get("/api/health").json()
        assert body["org_id_suffix"] == "ab"
