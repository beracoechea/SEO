import httpx
from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app


def _page(title: str, links: list[str]) -> str:
    anchors = "".join(f'<a href="{href}">{href}</a>' for href in links)
    return (
        f"<html><head><title>{title}</title>"
        f"<meta name='description' content='{title} desc'>"
        f"<link rel='canonical' href='https://www.example.com/{title.lower()}'>"
        f"</head><body><h1>{title}</h1>{anchors}</body></html>"
    )


def test_templates_crawl_mocked(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n", headers={"content-type": "text/plain"})
        if path.endswith("sitemap.xml"):
            return httpx.Response(
                200,
                text="<urlset><loc>https://www.example.com/a</loc></urlset>",
                headers={"content-type": "application/xml"},
            )
        return httpx.Response(200, text=_page("Home", []), headers={"content-type": "text/html"})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )

    with TestClient(app) as client:
        res = client.post(
            "/api/sites/site-1/crawls",
            json={"kind": "templates", "origin": "https://www.example.com"},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/site-1/summary").json()
        assert summ["crawl"]["sitemap_urls"] == 1
        assert summ["pages"]


def test_site_crawl_follows_links(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\n", headers={"content-type": "text/plain"})
        if path.endswith("sitemap.xml") or path.endswith("sitemap_index.xml"):
            return httpx.Response(404, text="missing")
        if path in {"/", ""}:
            body = _page("Home", ["/about", "/contact"])
            # home canonical in helper points to /home — override with real home html
            body = (
                "<html><head><title>Home</title><meta name='description' content='Shop'>"
                "<link rel='canonical' href='https://www.example.com/'></head>"
                "<body><h1>Home</h1><a href='/about'>About</a><a href='/contact'>Contact</a></body></html>"
            )
            return httpx.Response(200, text=body, headers={"content-type": "text/html"})
        if path == "/about":
            return httpx.Response(
                200,
                text=(
                    "<html><head><title>About us</title><meta name='description' content='About'>"
                    "<link rel='canonical' href='https://www.example.com/about'></head>"
                    "<body><h1>About</h1></body></html>"
                ),
                headers={"content-type": "text/html"},
            )
        if path == "/contact":
            return httpx.Response(
                200,
                text=(
                    "<html><head><title>Contact</title><meta name='description' content='Contact'>"
                    "<link rel='canonical' href='https://www.example.com/contact'></head>"
                    "<body><h1>Contact</h1></body></html>"
                ),
                headers={"content-type": "text/html"},
            )
        return httpx.Response(404, text="nope")

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )

    with TestClient(app) as client:
        res = client.post(
            "/api/sites/shop/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 10},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/shop/summary").json()
        urls = {p["url"] for p in summ["pages"]}
        titles = {p["title"] for p in summ["pages"]}
        assert any("about" in u for u in urls)
        assert any("contact" in u for u in urls)
        assert "About us" in titles
        assert "Contact" in titles
        assert summ["crawl"]["pages_crawled"] >= 3


def test_crawl_rejects_private_origin(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    with TestClient(app) as client:
        res = client.post(
            "/api/sites/x/crawls",
            json={"kind": "site", "origin": "http://127.0.0.1"},
        )
        assert res.status_code == 400


def test_one_crawl_at_a_time(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    from app.db import connect

    with TestClient(app) as client:
        con = connect()
        con.execute(
            "INSERT INTO crawls(id, site_id, kind, status, started_at) VALUES (?,?,?,?,?)",
            ("c1", "site-a", "site", "running", "2026-01-01T00:00:00Z"),
        )
        con.commit()
        con.close()
        res = client.post(
            "/api/sites/site-b/crawls",
            json={"kind": "site", "origin": "https://www.example.com"},
        )
        assert res.status_code == 409
    monkeypatch.setenv("ALLOW_ANON", "0")
    with TestClient(app) as client:
        res = client.post(
            "/api/sites/x/crawls",
            json={"kind": "site", "origin": "https://www.example.com"},
        )
        assert res.status_code == 401
