from __future__ import annotations

import asyncio
import gzip
import http.client
import os
import socket
import time
import urllib.error
import urllib.request
import zlib
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.browser import JsRenderer, js_crawl_enabled, needs_js_render, normalize_render_js, resolved_js_status
from app.db import connect
from app.indexation import robots_directives
from app.parse import (
    assert_public_http_url,
    canonical_matches,
    extract_embedded_page_hrefs,
    extract_locs,
    is_asset_url,
    is_sitemap_index,
    normalize_url,
    parse_html,
    parse_robots_disallow,
    parse_robots_sitemaps,
    robots_blocks,
    same_host,
)
from app.score import classify_issues, score_url, site_score

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36 TechnicalSEOMonitor/0.1"
)
SAFETY_CAP = 50000
WORKERS = 24
RATE_CAP = 12.0
TRANSIENT_HTTP = {0, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}

_cancel_ids: set[str] = set()


def request_cancel(crawl_id: str) -> None:
    if crawl_id:
        _cancel_ids.add(crawl_id)


def crawl_cancelled(crawl_id: str | None) -> bool:
    return bool(crawl_id and crawl_id in _cancel_ids)


def clear_cancel(crawl_id: str | None) -> None:
    if crawl_id:
        _cancel_ids.discard(crawl_id)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _timeout_s(request: httpx.Request) -> float:
    timeout = request.extensions.get("timeout")
    read = getattr(timeout, "read", None)
    if isinstance(read, (int, float)):
        return float(read)
    pool = getattr(timeout, "pool", None)
    if isinstance(pool, (int, float)):
        return float(pool)
    return 20.0


def _inflate_body(raw_headers: list[tuple[str, str]], body: bytes) -> bytes:
    enc = ""
    for key, value in raw_headers:
        if key.lower() == "content-encoding":
            enc = value.lower()
            break
    if not enc or enc == "identity":
        return body
    try:
        if "gzip" in enc:
            return gzip.decompress(body)
        if "deflate" in enc:
            try:
                return zlib.decompress(body)
            except zlib.error:
                return zlib.decompress(body, -zlib.MAX_WBITS)
    except Exception:
        return body
    return body


def _urllib_response(request: httpx.Request, opener: urllib.request.OpenerDirector) -> httpx.Response:
    headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in request.headers.raw}
    headers.pop("Host", None)
    headers.pop("host", None)
    req = urllib.request.Request(str(request.url), headers=headers, method=request.method)
    try:
        with opener.open(req, timeout=_timeout_s(request)) as resp:
            status = getattr(resp, "status", None) or resp.getcode()
            raw_headers = list(resp.headers.items())
            body = resp.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw_headers = list(exc.headers.items()) if exc.headers else []
        try:
            body = exc.read()
        except Exception:
            body = b""
    except TimeoutError as exc:
        raise httpx.TimeoutException(str(exc)) from exc
    except urllib.error.URLError as exc:
        reason = exc.reason
        if isinstance(reason, (TimeoutError, socket.timeout)):
            raise httpx.TimeoutException(str(exc)) from exc
        raise httpx.ConnectError(str(exc)) from exc
    except (ConnectionError, http.client.IncompleteRead, OSError) as exc:
        raise httpx.ConnectError(str(exc)) from exc
    body = _inflate_body(raw_headers, body)
    filtered = [
        (k, v)
        for k, v in raw_headers
        if k.lower() not in {"content-encoding", "content-length", "transfer-encoding"}
    ]
    return httpx.Response(status, headers=filtered, content=body, request=request)


class AsyncUrllibTransport(httpx.AsyncBaseTransport):
    """Fetch via stdlib urllib so Cloudflare bot checks do not 403 the crawl."""

    def __init__(self, pool: int = WORKERS, executor: ThreadPoolExecutor | None = None) -> None:
        self._executor = executor
        self._openers = [self._make_opener() for _ in range(max(1, pool))]
        self._queue: asyncio.Queue[urllib.request.OpenerDirector] | None = None

    def _make_opener(self) -> urllib.request.OpenerDirector:
        return urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(CookieJar()),
            _NoRedirect,
        )

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if self._queue is None:
            self._queue = asyncio.Queue()
            for opener in self._openers:
                self._queue.put_nowait(opener)
        opener = await self._queue.get()
        loop = asyncio.get_running_loop()
        try:
            try:
                if self._executor is not None:
                    return await loop.run_in_executor(self._executor, _urllib_response, request, opener)
                return await asyncio.to_thread(_urllib_response, request, opener)
            except httpx.ConnectError:
                opener = self._make_opener()
                raise
        finally:
            self._queue.put_nowait(opener)


def make_client(**kwargs) -> httpx.AsyncClient:
    executor = kwargs.pop("executor", None)
    pool = int(kwargs.pop("pool", WORKERS))
    if "transport" not in kwargs:
        kwargs["transport"] = AsyncUrllibTransport(pool=pool, executor=executor)
    return httpx.AsyncClient(**kwargs)


class _RateLimiter:
    def __init__(self, per_sec: float) -> None:
        self.per_sec = per_sec
        self._lock = asyncio.Lock()
        self._next = time.monotonic()

    async def acquire(self) -> None:
        if self.per_sec <= 0:
            return
        async with self._lock:
            now = time.monotonic()
            wait = max(0.0, self._next - now)
            self._next = max(now, self._next) + 1.0 / self.per_sec
        if wait:
            await asyncio.sleep(wait)


def is_challenge_page(status: int, text: str) -> bool:
    if status not in {403, 503}:
        return False
    blob = (text or "").lower()
    return "just a moment" in blob or "cf-browser-verification" in blob or "challenge-platform" in blob


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rate_per_sec(rate: float) -> float:
    if os.getenv("CRAWL_NO_DELAY") == "1":
        return 0.0
    return max(8.0, min(float(rate or 10), RATE_CAP))


def _worker_count() -> int:
    if os.getenv("CRAWL_NO_DELAY") == "1":
        return 3
    return WORKERS


def _is_htmlish(content_type: str) -> bool:
    ct = content_type.lower()
    return ct.startswith("text/") or "html" in ct or "xml" in ct or "json" in ct or not ct


class Fetch:
    __slots__ = (
        "status",
        "text",
        "hops",
        "final",
        "ms",
        "content_type",
        "content",
        "redirect_status",
        "robots_tag",
        "rendered",
    )

    def __init__(
        self,
        status: int,
        text: str,
        hops: int,
        final: str,
        ms: int,
        content_type: str,
        content: bytes,
        redirect_status: int = 0,
        robots_tag: str = "",
        rendered: bool = False,
    ) -> None:
        self.status = status
        self.text = text
        self.hops = hops
        self.final = final
        self.ms = ms
        self.content_type = content_type
        self.content = content
        self.redirect_status = redirect_status
        self.robots_tag = robots_tag
        self.rendered = rendered


def _max_retries(status: int) -> int:
    if status == 500:
        return 1
    if status in TRANSIENT_HTTP:
        return 2
    return 0


def _body_text(res: httpx.Response, content_type: str) -> str:
    if not _is_htmlish(content_type):
        return ""
    try:
        return res.text
    except Exception:
        return res.content.decode("utf-8", "replace")


async def _get_once(client: httpx.AsyncClient, url: str) -> Fetch:
    assert_public_http_url(url)
    hops = 0
    current = url
    seen: set[str] = set()
    first_3xx = 0
    t0 = time.perf_counter()
    last = Fetch(0, "", 0, url, 0, "", b"")
    while hops < 10:
        if current in seen:
            break
        seen.add(current)
        try:
            res = await client.get(current, follow_redirects=False)
        except (httpx.HTTPError, OSError, TimeoutError):
            ms = int((time.perf_counter() - t0) * 1000)
            return Fetch(0, "", hops, current, ms, "", b"", first_3xx)
        ct = res.headers.get("content-type", "")
        text = _body_text(res, ct)
        tag = res.headers.get("x-robots-tag") or ""
        last = Fetch(res.status_code, text, hops, current, 0, ct, res.content, first_3xx, tag)
        if res.is_redirect:
            if not first_3xx:
                first_3xx = res.status_code
                last.redirect_status = first_3xx
            loc = res.headers.get("location")
            if not loc:
                break
            nxt = normalize_url(loc, current) or current
            current = nxt
            hops += 1
            last.hops = hops
            last.final = current
            last.redirect_status = first_3xx
            continue
        last.final = str(res.url) if res.url else current
        last.redirect_status = first_3xx
        break
    last.ms = int((time.perf_counter() - t0) * 1000)
    last.hops = hops
    last.redirect_status = first_3xx
    return last


async def _get(client: httpx.AsyncClient, url: str) -> Fetch:
    last = await _get_once(client, url)
    attempt = 0
    while attempt < _max_retries(last.status):
        attempt += 1
        if os.getenv("CRAWL_NO_DELAY") != "1":
            wait = 1.5 * attempt if last.status == 0 else 0.4 * attempt
            await asyncio.sleep(wait)
        last = await _get_once(client, url)
    return last


async def enrich_with_js(
    fetch: Fetch,
    url: str,
    expect_html: bool,
    mode: str,
    renderer: JsRenderer | None,
) -> Fetch:
    if renderer is None or renderer.disabled:
        return fetch
    challenge = is_challenge_page(fetch.status, fetch.text)
    if not needs_js_render(
        mode,
        status=fetch.status,
        text=fetch.text,
        expect_html=expect_html,
        url=url,
        challenge=challenge,
    ):
        return fetch
    rendered = await renderer.render(fetch.final or url)
    if rendered is None or not rendered.text:
        return fetch
    if challenge or fetch.status in {0, 403, 404, 410, 503}:
        fetch.status = resolved_js_status(fetch.status, rendered.status, rendered.text)
    fetch.text = rendered.text
    fetch.content_type = "text/html"
    fetch.ms += rendered.ms
    fetch.rendered = True
    if rendered.final:
        fetch.final = rendered.final
    return fetch


def _bucket(status: int, hops: int = 0) -> str | None:
    if status == 0:
        return None
    if status >= 500:
        return "5xx"
    if status >= 400:
        return "4xx"
    if hops >= 1 or 300 <= status < 400:
        return "3xx"
    return "ok"


def _decode_maybe_gzip(fetch: Fetch) -> str:
    url = fetch.final.lower()
    if url.endswith(".gz") or "gzip" in fetch.content_type.lower():
        try:
            return gzip.decompress(fetch.content).decode("utf-8", "replace")
        except Exception:
            return fetch.text
    return fetch.text


def _record_page(
    con,
    crawl_id: str,
    url: str,
    fetch: Fetch,
    depth: int,
    expect_html: bool,
    snaps: list[tuple[int, int]],
    buckets: dict[str, int],
    counts: dict[str, int],
    titles: list[str],
) -> list[str]:
    html = fetch.text if expect_html else ""
    parsed = parse_html(html) if html else {
        "title": "",
        "h1": "",
        "meta": "",
        "canonical": "",
        "robots_meta": "",
        "imgs": 0,
        "imgs_no_alt": 0,
        "links": [],
    }
    title = str(parsed.get("title") or "")
    canonical = str(parsed.get("canonical") or "")
    robots_meta = str(parsed.get("robots_meta") or "")
    robots_header = fetch.robots_tag or ""
    noindex, nofollow = robots_directives(robots_meta, robots_header)
    has_canonical = bool(canonical) if expect_html and fetch.status == 200 else True
    canon_ok = canonical_matches(url, canonical) if expect_html else True
    sc, issues = score_url(
        fetch.status,
        title,
        str(parsed.get("h1") or ""),
        str(parsed.get("meta") or ""),
        int(parsed.get("imgs") or 0),
        int(parsed.get("imgs_no_alt") or 0),
        fetch.hops,
        onpage=expect_html,
        canonical_ok=canon_ok,
        has_canonical=has_canonical,
        noindex=noindex,
        nofollow=nofollow,
        ms=fetch.ms,
    )
    level = classify_issues(issues)
    counts[level] = counts.get(level, 0) + 1
    bucket = _bucket(fetch.status, fetch.hops)
    if bucket:
        buckets[bucket] += 1
    snaps.append((sc, depth))
    if expect_html and title:
        titles.append(title.strip().lower())
    if "canonical" in issues:
        counts["canonical"] = counts.get("canonical", 0) + 1
    con.execute(
        """INSERT INTO snapshots(crawl_id, url, status, depth, title, h1, meta, canonical, score, issues, fetched_at, ms, final_url, robots_meta, hops, redirect_status, robots_header, fetched, rendered)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)""",
        (
            crawl_id,
            url,
            fetch.status,
            depth,
            title if expect_html else "",
            parsed.get("h1") if expect_html else "",
            parsed.get("meta") if expect_html else "",
            canonical if expect_html else "",
            sc,
            ",".join(issues),
            _now(),
            fetch.ms,
            fetch.final,
            robots_meta if expect_html else "",
            fetch.hops,
            fetch.redirect_status or 0,
            robots_header,
            1 if fetch.rendered else 0,
        ),
    )
    links = parsed.get("links") if expect_html and fetch.status < 400 else []
    out = list(links) if isinstance(links, list) else []
    if expect_html and fetch.status < 400 and html:
        out.extend(extract_embedded_page_hrefs(html))
    return out


def _merge_issues(existing: str, extra: list[str]) -> str:
    found = [c for c in (existing or "").split(",") if c]
    for code in extra:
        if code not in found:
            found.append(code)
    return ",".join(found)


def _finalize_indexation(
    con,
    crawl_id: str,
    sitemap_set: set[str],
    link_set: set[str],
    seed_set: set[str],
    blocked_sitemap: set[str],
) -> None:
    rows = con.execute(
        "SELECT id, url, status, score, issues, fetched FROM snapshots WHERE crawl_id=?",
        (crawl_id,),
    ).fetchall()
    have = {row["url"] for row in rows}
    for url in blocked_sitemap:
        if url in have:
            continue
        con.execute(
            """INSERT INTO snapshots(crawl_id, url, status, depth, title, h1, meta, canonical, score, issues, fetched_at, ms, final_url, robots_meta, hops, redirect_status, in_sitemap, via_link, via_sitemap, robots_header, fetched, rendered)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)""",
            (
                crawl_id,
                url,
                0,
                1,
                "",
                "",
                "",
                "",
                92,
                "sitemapBlocked",
                _now(),
                0,
                url,
                "",
                0,
                0,
                1,
                0,
                1,
                "",
            ),
        )
    rows = con.execute(
        "SELECT id, url, status, score, issues, fetched FROM snapshots WHERE crawl_id=?",
        (crawl_id,),
    ).fetchall()
    for row in rows:
        url = row["url"]
        in_sm = 1 if url in sitemap_set else 0
        via_sm = in_sm
        via_link = 1 if url in link_set else 0
        extra: list[str] = []
        score = int(row["score"] or 0)
        fetched = int(row["fetched"] if row["fetched"] is not None else 1)
        if fetched and in_sm and 400 <= int(row["status"] or 0) < 500:
            extra.append("sitemap404")
        if fetched and in_sm and "noindex" in (row["issues"] or "").split(","):
            extra.append("sitemapNoindex")
            score = max(0, score - 8)
        if in_sm and not via_link and url not in seed_set and fetched:
            extra.append("orphan")
            score = max(0, score - 4)
        issues = _merge_issues(row["issues"] or "", extra)
        con.execute(
            "UPDATE snapshots SET in_sitemap=?, via_link=?, via_sitemap=?, issues=?, score=? WHERE id=?",
            (in_sm, via_link, via_sm, issues, score, row["id"]),
        )
    con.commit()


def _progress(
    con,
    crawl_id: str,
    snaps: list[tuple[int, int]],
    buckets: dict[str, int],
    counts: dict[str, int],
    sitemap_count: int,
    titles: list[str],
    max_pages: int,
    done: bool,
    times: list[int],
    discovered: int,
) -> None:
    dups = sum(1 for _t, n in Counter(titles).items() if n > 1)
    avg = int(sum(times) / len(times)) if times else 0
    canon_mis = counts.get("canonical", 0)
    score = site_score(snaps) if snaps else None
    if dups:
        score = max(0, (score or 0) - min(15, dups * 2))
    crawled = len([s for s in snaps])
    found = max(discovered, crawled, sitemap_count)
    con.execute(
        """UPDATE crawls SET status=?, score=?, finished_at=?, urls_ok=?, urls_3xx=?, urls_4xx=?, urls_5xx=?,
           issue_critical=?, issue_warn=?, issue_ok=?, sitemap_urls=?, pages_crawled=?, avg_ms=?,
           dup_titles=?, canonical_mismatch=?, max_pages=?, discovered=?, error=? WHERE id=?""",
        (
            "done" if done else "running",
            score,
            _now() if done else None,
            buckets["ok"],
            buckets["3xx"],
            buckets["4xx"],
            buckets["5xx"],
            counts["critical"],
            counts["warn"],
            counts["ok"],
            sitemap_count,
            crawled,
            avg,
            dups,
            canon_mis,
            max_pages,
            found,
            None,
            crawl_id,
        ),
    )
    con.commit()


async def run_crawl(
    site_id: str,
    kind: str,
    origin: str,
    template_urls: list[str],
    one_url: str | None,
    rate: float,
    max_pages: int = 200,
    max_depth: int = 8,
    crawl_id: str | None = None,
    render_js: str = "auto",
) -> dict:
    origin = origin.rstrip("/")
    assert_public_http_url(origin + "/")
    host_origin = origin
    crawl_id = crawl_id or str(uuid4())
    cap = min(SAFETY_CAP, max(1, max_pages or 20000))
    limiter = _RateLimiter(_rate_per_sec(rate))
    workers_n = _worker_count()
    executor = ThreadPoolExecutor(max_workers=workers_n)

    con = connect()
    existing = con.execute("SELECT id FROM crawls WHERE id=?", (crawl_id,)).fetchone()
    if not existing:
        con.execute(
            "INSERT INTO crawls(id, site_id, kind, status, started_at, max_pages) VALUES (?,?,?,?,?,?)",
            (crawl_id, site_id, kind, "running", _now(), cap),
        )
        con.commit()

    snaps: list[tuple[int, int]] = []
    buckets = {"ok": 0, "3xx": 0, "4xx": 0, "5xx": 0}
    counts = {"critical": 0, "warn": 0, "ok": 0}
    titles: list[str] = []
    times: list[int] = []
    sitemap_count = 0
    disallow: list[str] = []

    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    render_js = normalize_render_js(render_js)
    renderer: JsRenderer | None = JsRenderer(UA) if js_crawl_enabled(render_js) else None

    try:
        if renderer is not None:
            await renderer.start()
            if renderer.disabled:
                renderer = None
        async with make_client(
            headers=headers,
            timeout=httpx.Timeout(20.0, connect=8.0),
            executor=executor,
            pool=workers_n,
        ) as client:
            queue: deque[tuple[str, int]] = deque()
            seen: set[str] = set()
            sitemap_set: set[str] = set()
            link_set: set[str] = set()
            seed_set: set[str] = set()
            blocked_sitemap: set[str] = set()

            def enqueue(url: str, depth: int, base: str = origin + "/", via: str = "link") -> None:
                if depth > max_depth:
                    return
                norm = normalize_url(url, base)
                if not norm:
                    return
                if not same_host(norm, host_origin):
                    return
                if is_asset_url(norm):
                    return
                if via == "sitemap":
                    sitemap_set.add(norm)
                elif via == "seed":
                    seed_set.add(norm)
                else:
                    link_set.add(norm)
                path = urlparse(norm).path or "/"
                blocked = robots_blocks(path, disallow)
                if via == "sitemap" and blocked:
                    blocked_sitemap.add(norm)
                    return
                if blocked:
                    return
                if norm in seen:
                    return
                if len(seen) >= cap:
                    return
                seen.add(norm)
                queue.append((norm, depth))

            if kind == "url":
                target = (one_url or origin).strip()
                assert_public_http_url(target)
                if urlparse(target).hostname != urlparse(origin).hostname:
                    raise ValueError("urlMustMatchOrigin")
                enqueue(target, 0, via="seed")
            else:
                enqueue(origin + "/", 0, via="seed")
                for t in template_urls[:100]:
                    if t.strip():
                        enqueue(t.strip(), 1, via="seed")

                try:
                    await limiter.acquire()
                    robots = await _get(client, origin + "/robots.txt")
                    if robots.status == 200:
                        disallow = parse_robots_disallow(robots.text)
                        maps = parse_robots_sitemaps(origin, robots.text)
                    else:
                        maps = []
                except ValueError:
                    maps = []
                if not maps:
                    maps = [origin + "/sitemap.xml", origin + "/sitemap_index.xml"]

                nested: list[str] = []
                for sm in maps[:40]:
                    try:
                        await limiter.acquire()
                        fetch = await _get(client, sm)
                    except ValueError:
                        continue
                    xml = _decode_maybe_gzip(fetch)
                    if fetch.status != 200 or not xml:
                        continue
                    locs = extract_locs(xml)
                    if is_sitemap_index(xml):
                        nested.extend(locs[:80])
                    else:
                        sitemap_count += len(locs)
                        if kind == "site":
                            for loc in locs:
                                enqueue(loc, 1, sm, via="sitemap")
                for sm in nested[:80]:
                    try:
                        await limiter.acquire()
                        fetch = await _get(client, sm)
                    except ValueError:
                        continue
                    xml = _decode_maybe_gzip(fetch)
                    if fetch.status != 200:
                        continue
                    locs = extract_locs(xml)
                    sitemap_count += len(locs)
                    if kind == "site":
                        for loc in locs:
                            enqueue(loc, 1, sm, via="sitemap")

            crawled = 0
            in_flight = 0
            lock = asyncio.Lock()

            async def visit(url: str, depth: int) -> None:
                nonlocal crawled
                if crawl_cancelled(crawl_id):
                    return
                await limiter.acquire()
                try:
                    fetch = await _get(client, url)
                except ValueError:
                    return
                except Exception:
                    fetch = Fetch(0, "", 0, url, 0, "", b"")
                expect_html = "html" in fetch.content_type.lower() or fetch.text.strip().startswith("<")
                if url.rstrip("/").endswith("robots.txt"):
                    expect_html = False
                fetch = await enrich_with_js(fetch, url, expect_html, render_js, renderer)
                if fetch.rendered:
                    expect_html = True
                async with lock:
                    if crawled >= cap:
                        return
                    try:
                        links = _record_page(
                            con, crawl_id, url, fetch, depth, expect_html, snaps, buckets, counts, titles
                        )
                    except Exception:
                        crawled += 1
                        return
                    times.append(fetch.ms)
                    crawled += 1
                    final = fetch.final or url
                    if kind == "site" and expect_html and fetch.status < 400 and same_host(final, host_origin):
                        for href in links:
                            enqueue(href, depth + 1, final, via="link")
                    found = max(sitemap_count, crawled + len(queue))
                    if crawled % 8 == 0 or crawled <= 2:
                        _progress(
                            con, crawl_id, snaps, buckets, counts, sitemap_count, titles, cap, False, times, found
                        )

            async def worker() -> None:
                nonlocal in_flight
                while True:
                    if crawl_cancelled(crawl_id):
                        return
                    item: tuple[str, int] | None = None
                    async with lock:
                        if crawled >= cap:
                            return
                        if queue:
                            item = queue.popleft()
                            in_flight += 1
                        elif in_flight == 0:
                            return
                    if item is None:
                        await asyncio.sleep(0.02)
                        continue
                    try:
                        await visit(*item)
                    finally:
                        async with lock:
                            in_flight -= 1

            await asyncio.gather(*(worker() for _ in range(workers_n)))

        found = max(sitemap_count, len(snaps), len(sitemap_set))
        interrupted = crawl_cancelled(crawl_id)
        if interrupted:
            _progress(con, crawl_id, snaps, buckets, counts, sitemap_count, titles, cap, False, times, found)
            con.execute(
                "UPDATE crawls SET status=?, error=?, finished_at=? WHERE id=?",
                ("failed", "crawl.interrupted", _now(), crawl_id),
            )
            con.commit()
        else:
            _finalize_indexation(con, crawl_id, sitemap_set, link_set, seed_set, blocked_sitemap)
            _progress(con, crawl_id, snaps, buckets, counts, sitemap_count, titles, cap, True, times, found)
        clear_cancel(crawl_id)
    except Exception as exc:
        con.execute(
            "UPDATE crawls SET status=?, error=?, finished_at=? WHERE id=?",
            ("failed", str(exc)[:300], _now(), crawl_id),
        )
        con.commit()
        raise
    finally:
        if renderer is not None:
            await renderer.close()
        executor.shutdown(wait=False, cancel_futures=True)
        con.close()

    return {"id": crawl_id, "status": "done", "pages": len(snaps), "sitemap_urls": sitemap_count}
