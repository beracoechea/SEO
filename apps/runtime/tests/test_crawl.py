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


def test_redirect_lands_in_3xx_not_200(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\n", headers={"content-type": "text/plain"})
        if "sitemap" in path:
            return httpx.Response(404, text="missing")
        if path == "/old":
            return httpx.Response(301, headers={"location": "/new", "content-type": "text/html"})
        if path == "/new":
            return httpx.Response(
                200,
                text=(
                    "<html><head><title>New</title><meta name='description' content='New'>"
                    "<link rel='canonical' href='https://www.example.com/new'></head>"
                    "<body><h1>New</h1></body></html>"
                ),
                headers={"content-type": "text/html"},
            )
        body = (
            "<html><head><title>Home</title><meta name='description' content='Home'>"
            "<link rel='canonical' href='https://www.example.com/'></head>"
            "<body><h1>Home</h1><a href='/old'>Old</a></body></html>"
        )
        return httpx.Response(200, text=body, headers={"content-type": "text/html"})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )

    with TestClient(app) as client:
        res = client.post(
            "/api/sites/redir/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 10},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/redir/summary").json()
        old = next(p for p in summ["pages"] if p["url"].rstrip("/").endswith("/old"))
        assert old["hops"] >= 1
        assert old["redirect_status"] == 301
        assert old["status"] == 200
        assert "redirect" in (old["issues"] or "")
        assert summ["crawl"]["urls_3xx"] >= 1


def _html(title: str, path: str, links: list[str]) -> str:
    anchors = "".join(f'<a href="{href}">{href}</a>' for href in links)
    return (
        f"<html><head><title>{title}</title><meta name='description' content='{title}'>"
        f"<link rel='canonical' href='https://www.example.com{path}'></head>"
        f"<body><h1>{title}</h1>{anchors}</body></html>"
    )


def test_indexation_map_sitemap_robots_orphans(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(
                200,
                text="User-agent: *\nDisallow: /hidden\nSitemap: /sitemap.xml\n",
                headers={"content-type": "text/plain"},
            )
        if path.endswith("sitemap.xml"):
            body = """<urlset>
              <loc>https://www.example.com/</loc>
              <loc>https://www.example.com/about</loc>
              <loc>https://www.example.com/hidden</loc>
              <loc>https://www.example.com/gone</loc>
              <loc>https://www.example.com/orphan</loc>
            </urlset>"""
            return httpx.Response(200, text=body, headers={"content-type": "application/xml"})
        if path == "/about":
            return httpx.Response(
                200,
                text=_html("About", "/about", []),
                headers={"content-type": "text/html", "x-robots-tag": "noindex"},
            )
        if path == "/gone":
            return httpx.Response(404, text="missing")
        if path == "/orphan":
            return httpx.Response(200, text=_html("Orphan", "/orphan", []), headers={"content-type": "text/html"})
        if path == "/only-linked":
            return httpx.Response(200, text=_html("Linked", "/only-linked", []), headers={"content-type": "text/html"})
        if path == "/hidden":
            raise AssertionError("must not fetch robots-disallowed URL")
        return httpx.Response(
            200,
            text=_html("Home", "/", ["/about", "/only-linked"]),
            headers={"content-type": "text/html"},
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )

    with TestClient(app) as client:
        res = client.post(
            "/api/sites/idx/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 20},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/idx/summary").json()
        hidden = next(p for p in summ["pages"] if p["url"].rstrip("/").endswith("/hidden"))
        assert hidden["fetched"] == 0
        assert "sitemapBlocked" in (hidden["issues"] or "")
        about = next(p for p in summ["pages"] if p["url"].rstrip("/").endswith("/about"))
        assert "noindex" in (about["issues"] or "")
        assert "sitemapNoindex" in (about["issues"] or "")
        gone = next(p for p in summ["pages"] if p["url"].rstrip("/").endswith("/gone"))
        assert "sitemap404" in (gone["issues"] or "")
        orphan = next(p for p in summ["pages"] if p["url"].rstrip("/").endswith("/orphan"))
        assert "orphan" in (orphan["issues"] or "")
        linked = next(p for p in summ["pages"] if p["url"].rstrip("/").endswith("/only-linked"))
        assert not linked.get("in_sitemap")


def test_crawl_diff_detects_new_404(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
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
        assert client.post(
            "/api/sites/diffy/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 10},
        ).status_code == 200
        wave["n"] = 1
        assert client.post(
            "/api/sites/diffy/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 10},
        ).status_code == 200
        summ = client.get("/api/sites/diffy/summary").json()
        assert summ["diff"]
        assert summ["diff"]["counts"]["new_404"] >= 1


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
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["queued"] is True
        assert body["crawl"]["status"] == "queued"
    monkeypatch.setenv("ALLOW_ANON", "0")
    with TestClient(app) as client:
        res = client.post(
            "/api/sites/x/crawls",
            json={"kind": "site", "origin": "https://www.example.com"},
        )
        assert res.status_code == 401


def test_transient_503_then_200_is_ok(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    hits = {"home": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if "sitemap" in path:
            return httpx.Response(404, text="no")
        if path in {"/", ""}:
            hits["home"] += 1
            if hits["home"] == 1:
                return httpx.Response(503, text="busy")
            body = (
                "<html><head><title>Home</title><meta name='description' content='Shop'>"
                "<link rel='canonical' href='https://www.example.com/'></head>"
                "<body><h1>Home</h1></body></html>"
            )
            return httpx.Response(200, text=body, headers={"content-type": "text/html"})
        return httpx.Response(404, text="nope")

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )
    with TestClient(app) as client:
        res = client.post(
            "/api/sites/shop/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 5},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/shop/summary").json()
        assert summ["crawl"]["urls_5xx"] == 0
        assert summ["crawl"]["urls_ok"] >= 1
        assert hits["home"] >= 2


def test_connect_error_is_not_500(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if "sitemap" in path:
            return httpx.Response(404, text="no")
        raise httpx.ConnectError("drop")

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )
    with TestClient(app) as client:
        res = client.post(
            "/api/sites/shop/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 5},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/shop/summary").json()
        assert summ["crawl"]["urls_5xx"] == 0
        assert any("unreachable" in (p.get("issues") or "") for p in summ["pages"])


def test_connection_reset_does_not_abort_crawl(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.rstrip("/") or "/"
        if path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if "sitemap" in path:
            return httpx.Response(404, text="no")
        if path == "/about":
            raise OSError(10054, "connection reset by peer")
        body = (
            "<html><head><title>Home</title><meta name='description' content='Shop'>"
            "<link rel='canonical' href='https://www.example.com/'></head>"
            "<body><h1>Home</h1><a href='/about'>About</a></body></html>"
        )
        return httpx.Response(200, text=body, headers={"content-type": "text/html"})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.crawler.make_client",
        lambda **kw: httpx.AsyncClient(transport=transport, timeout=kw.get("timeout", 10.0), headers=kw.get("headers")),
    )
    with TestClient(app) as client:
        res = client.post(
            "/api/sites/shop/crawls",
            json={"kind": "site", "origin": "https://www.example.com", "maxPages": 5},
        )
        assert res.status_code == 200, res.text
        summ = client.get("/api/sites/shop/summary").json()
        assert summ["crawl"]["status"] == "done"
        assert summ["crawl"]["pages_crawled"] >= 1
        assert summ["crawl"]["urls_5xx"] == 0
