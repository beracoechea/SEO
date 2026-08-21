from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass

from app.parse import parse_html

SPA_MARKERS = (
    'id="root"',
    "id='root'",
    'id="app"',
    "id='app'",
    'id="__next"',
    'id="__nuxt"',
    "data-reactroot",
    "__NEXT_DATA__",
    "window.__NUXT__",
    "ng-version",
    "enable javascript",
    "enable js",
)

SCRIPT_RE = re.compile(r"<script[\s\S]*?</script>", re.I)
STYLE_RE = re.compile(r"<style[\s\S]*?</style>", re.I)
TAG_RE = re.compile(r"<[^>]+>")


def normalize_render_js(value: str | None) -> str:
    key = (value or "auto").strip().lower()
    return key if key in {"off", "on", "auto"} else "auto"


def js_crawl_enabled(mode: str) -> bool:
    if normalize_render_js(mode) == "off":
        return False
    if os.getenv("CRAWL_NO_JS") == "1" or os.getenv("CRAWL_NO_DELAY") == "1":
        return False
    return True


def looks_like_js_shell(html: str) -> bool:
    blob = html or ""
    if len(blob.strip()) < 80:
        return True
    low = blob.lower()
    if not any(marker in low for marker in SPA_MARKERS):
        return False
    parsed = parse_html(blob)
    title = str(parsed.get("title") or "").strip()
    h1 = str(parsed.get("h1") or "").strip()
    links = parsed.get("links") or []
    text = TAG_RE.sub(" ", STYLE_RE.sub(" ", SCRIPT_RE.sub(" ", blob)))
    words = [w for w in text.split() if w]
    return (not title) or (not h1) or len(links) < 3 or len(words) < 40


def needs_js_render(
    mode: str,
    *,
    status: int,
    text: str,
    expect_html: bool,
    url: str,
    challenge: bool,
) -> bool:
    mode = normalize_render_js(mode)
    if mode == "off" or not expect_html:
        return False
    path = (url or "").split("?", 1)[0].rstrip("/").lower()
    if path.endswith("robots.txt") or path.endswith(".xml") or path.endswith(".xml.gz"):
        return False
    if mode == "on":
        return True
    if challenge:
        return True
    if status in {0, 403, 503}:
        return True
    return looks_like_js_shell(text)


@dataclass
class RenderedPage:
    status: int
    text: str
    ms: int
    final: str


class JsRenderer:
    def __init__(self, user_agent: str) -> None:
        self._ua = user_agent
        self._pw = None
        self._browser = None
        self._context = None
        self._sem = None
        self.disabled = False

    async def start(self) -> None:
        if self.disabled:
            return
        try:
            from playwright.async_api import async_playwright

            self._sem = asyncio.Semaphore(2)
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(
                headless=True,
                args=["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
            )
            self._context = await self._browser.new_context(
                user_agent=self._ua,
                locale="es-MX",
                java_script_enabled=True,
                ignore_https_errors=False,
            )
        except Exception:
            self.disabled = True
            await self.close()

    async def render(self, url: str) -> RenderedPage | None:
        if self.disabled or self._context is None or self._sem is None:
            return None
        await self._sem.acquire()
        page = None
        t0 = time.perf_counter()
        try:
            page = await self._context.new_page()
            page.set_default_timeout(20000)
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(1.2)
            html = await page.content()
            status = resp.status if resp is not None else 0
            final = page.url or url
            return RenderedPage(status=status, text=html or "", ms=int((time.perf_counter() - t0) * 1000), final=final)
        except Exception:
            return None
        finally:
            if page is not None:
                try:
                    await page.close()
                except Exception:
                    pass
            self._sem.release()

    async def close(self) -> None:
        if self._context is not None:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._pw is not None:
            try:
                await self._pw.stop()
            except Exception:
                pass
            self._pw = None
