import asyncio

from app.browser import (
    RenderedPage,
    looks_like_js_shell,
    looks_like_live_page,
    needs_js_render,
    normalize_render_js,
    resolved_js_status,
)
from app.crawler import Fetch, enrich_with_js

SHELL = (
    "<html><head><title></title></head>"
    "<body><div id='root'></div><script src='/assets/index.js'></script></body></html>"
)
RICH = (
    "<html><head><title>Home</title><meta name='description' content='Shop of industrial parts'>"
    "<link rel='canonical' href='https://ex.com/'></head>"
    "<body><h1>Home</h1><p>Welcome to the catalog of sensors, PLCs and cables for the plant.</p>"
    "<a href='/a'>a</a><a href='/b'>b</a><a href='/c'>c</a></body></html>"
)
NEXT_SSR = (
    "<html><head><title>Product</title></head><body>"
    "<script id='__NEXT_DATA__' type='application/json'>{}</script>"
    "<h1>Sensor 4-20mA</h1>"
    "<p>Industrial transmitter for tanks and pipelines in the plant floor.</p>"
    "<a href='/a'>a</a><a href='/b'>b</a><a href='/c'>c</a></body></html>"
)
RENDERED = (
    "<html><head><title>Catalog</title><meta name='description' content='SPA catalog'>"
    "<link rel='canonical' href='https://ex.com/'></head>"
    "<body><h1>Catalog</h1><a href='/a'>a</a></body></html>"
)


def test_normalize_render_js():
    assert normalize_render_js(None) == "auto"
    assert normalize_render_js("ON") == "on"
    assert normalize_render_js("nope") == "auto"


def test_shell_vs_ssr():
    assert looks_like_js_shell(SHELL)
    assert not looks_like_js_shell(RICH)
    assert not looks_like_js_shell(NEXT_SSR)


def test_needs_js_render_modes():
    kwargs = dict(status=200, expect_html=True, url="https://ex.com/", challenge=False)
    assert needs_js_render("off", text=SHELL, **kwargs) is False
    assert needs_js_render("on", text=RICH, **kwargs) is True
    assert needs_js_render("auto", text=SHELL, **kwargs) is True
    assert needs_js_render("auto", text=RICH, **kwargs) is False
    assert needs_js_render("auto", status=200, text=SHELL, expect_html=True, url="https://ex.com/robots.txt", challenge=False) is False
    assert needs_js_render("auto", status=403, text="Just a moment...", expect_html=True, url="https://ex.com/", challenge=True) is True
    assert needs_js_render("auto", status=404, text=SHELL, expect_html=True, url="https://ex.com/spa", challenge=False) is True
    nginx_404 = (
        "<html><head><title>404 Not Found</title></head>"
        "<body><center><h1>404 Not Found</h1></center>"
        "<hr><center>nginx</center></body></html>"
    )
    assert needs_js_render("auto", status=404, text=nginx_404, expect_html=True, url="https://ex.com/gone", challenge=False) is False


class _FakeRenderer:
    disabled = False

    async def render(self, url: str) -> RenderedPage:
        return RenderedPage(200, RENDERED, 12, url)


def test_enrich_upgrades_spa_shell():
    fetch = Fetch(200, SHELL, 0, "https://ex.com/", 8, "text/html", b"")
    out = asyncio.run(enrich_with_js(fetch, "https://ex.com/", True, "auto", _FakeRenderer()))
    assert out.rendered is True
    assert out.text == RENDERED
    assert out.ms >= 20


def test_enrich_skips_server_html():
    fetch = Fetch(200, RICH, 0, "https://ex.com/", 8, "text/html", b"")
    out = asyncio.run(enrich_with_js(fetch, "https://ex.com/", True, "auto", _FakeRenderer()))
    assert out.rendered is False
    assert "Home" in out.text


def test_enrich_upgrades_spa_http_404_when_chrome_gets_200():
    fetch = Fetch(404, SHELL, 0, "https://ex.com/catalog", 8, "text/html", b"")
    out = asyncio.run(enrich_with_js(fetch, "https://ex.com/catalog", True, "auto", _FakeRenderer()))
    assert out.rendered is True
    assert out.status == 200
    assert out.text == RENDERED


class _Fake404Hydrated:
    disabled = False

    async def render(self, url: str) -> RenderedPage:
        html = (
            "<html><head><title>Catalog</title></head>"
            "<body><div id='root'><h1>Catalog</h1>"
            "<p>Sensors, PLCs and cables for the plant.</p></div></body></html>"
        )
        return RenderedPage(404, html, 12, url)


class _FakeReal404:
    disabled = False

    async def render(self, url: str) -> RenderedPage:
        html = (
            "<html><head><title>404 Not Found</title></head>"
            "<body><div id='root'><h1>Página no encontrada</h1></div></body></html>"
        )
        return RenderedPage(404, html, 12, url)


def test_enrich_treats_hydrated_spa_as_live_even_if_nav_stays_404():
    fetch = Fetch(404, SHELL, 0, "https://ex.com/catalog", 8, "text/html", b"")
    out = asyncio.run(enrich_with_js(fetch, "https://ex.com/catalog", True, "auto", _Fake404Hydrated()))
    assert out.status == 200
    assert looks_like_live_page(out.text)


def test_enrich_keeps_real_js_404():
    fetch = Fetch(404, SHELL, 0, "https://ex.com/missing", 8, "text/html", b"")
    out = asyncio.run(enrich_with_js(fetch, "https://ex.com/missing", True, "auto", _FakeReal404()))
    assert out.status == 404


def test_resolved_js_status():
    assert resolved_js_status(404, 200, RENDERED) == 200
    assert resolved_js_status(404, 404, RENDERED) == 200
    assert resolved_js_status(404, 404, "<html><head><title>404</title><h1>Not found</h1></html>") == 404
