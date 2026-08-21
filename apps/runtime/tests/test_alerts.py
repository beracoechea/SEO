import httpx
from fastapi.testclient import TestClient

from app.alerts import normalize_emails, save_alerts, webhook_request
from app.db import checkpoint_wal, connect, init_db
from app.main import app


def _html(title: str, path: str, links: list[str]) -> str:
    anchors = "".join(f'<a href="{href}">{href}</a>' for href in links)
    return (
        f"<html><head><title>{title}</title><meta name='description' content='{title}'>"
        f"<link rel='canonical' href='https://www.example.com{path}'></head>"
        f"<body><h1>{title}</h1>{anchors}</body></html>"
    )


def test_normalize_emails():
    assert normalize_emails(" A@B.com ; c@d.net,a@b.com ") == "a@b.com,c@d.net"
    assert normalize_emails("nope") == ""


def test_save_alerts_rejects_private_webhook(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    init_db()
    try:
        save_alerts("http://127.0.0.1/hook", None)
        raise AssertionError("expected originForbidden")
    except ValueError as exc:
        assert "originForbidden" in str(exc)


def test_free_webhook_formats():
    payload = {
        "origin": "https://www.example.com",
        "new_404": 2,
        "urls": ["https://www.example.com/gone"],
    }
    _, discord, _ = webhook_request("https://discord.com/api/webhooks/1/abc", payload)
    assert discord and "content" in discord
    _, teams, _ = webhook_request("https://company.webhook.office.com/webhookb2/x", payload)
    assert teams and "text" in teams
    headers, _, raw = webhook_request("https://ntfy.sh/seo-logicbus", payload)
    assert raw and b"404" in raw
    assert headers.get("Title", "").startswith("SEO")
    _, generic, _ = webhook_request("https://example.com/hooks/seo", payload)
    assert generic and generic.get("origin") == "https://www.example.com"


def test_alerts_api_stays_on_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    with TestClient(app) as client:
        res = client.put(
            "/api/alerts",
            json={"alertWebhook": "https://ntfy.sh/seo-demo", "alertEmail": "seo@example.com"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["alerts"]["webhook"] == "https://ntfy.sh/seo-demo"
        got = client.get("/api/alerts").json()
        assert got["alerts"]["email"] == "seo@example.com"
        overview = client.get("/api/sites").json()
        assert overview["alerts"]["webhook"] == "https://ntfy.sh/seo-demo"


def test_wal_checkpoint(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    init_db()
    con = connect()
    con.execute("INSERT INTO runtime_settings(k, v) VALUES('x','1')")
    con.commit()
    con.close()
    checkpoint_wal()
    assert (tmp_path / "runtime.sqlite").exists()


def test_alerts_fire_on_new_404(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    posted: list[dict] = []

    async def fake_post(_url: str, payload: dict) -> None:
        posted.append(payload)

    monkeypatch.setattr("app.alerts.post_webhook", fake_post)
    wave = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\n", headers={"content-type": "text/plain"})
        if "sitemap" in path:
            return httpx.Response(404, text="missing")
        if path == "/about":
            if wave["n"] >= 1:
                return httpx.Response(404, text="gone")
            return httpx.Response(200, text=_html("About", "/about", []), headers={"content-type": "text/html"})
        return httpx.Response(
            200,
            text=_html("Home", "/", ["/about"]),
            headers={"content-type": "text/html"},
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )

    with TestClient(app) as client:
        client.put("/api/alerts", json={"alertWebhook": "https://example.com/hooks/seo"})
        assert (
            client.post(
                "/api/sites/diffy/crawls",
                json={"kind": "site", "origin": "https://www.example.com", "maxPages": 10},
            ).status_code
            == 200
        )
        assert posted == []
        wave["n"] = 1
        assert (
            client.post(
                "/api/sites/diffy/crawls",
                json={"kind": "site", "origin": "https://www.example.com", "maxPages": 10},
            ).status_code
            == 200
        )
        assert len(posted) == 1
        assert posted[0]["event"] == "new_404"
        assert posted[0]["new_404"] >= 1
        assert any("/about" in u for u in posted[0]["urls"])
