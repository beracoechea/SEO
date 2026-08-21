from __future__ import annotations

import asyncio
import gzip
import os
import time
from collections import Counter, deque
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.db import connect
from app.parse import (
    assert_public_http_url,
    canonical_matches,
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

UA = "TechnicalSEOMonitor/0.1 (+https://logicbus.com; crawl)"
SAFETY_CAP = 50000


def make_client(**kwargs) -> httpx.AsyncClient:
    return httpx.AsyncClient(**kwargs)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _delay_s(rate: float) -> float:
    if os.getenv("CRAWL_NO_DELAY") == "1":
        return 0.0
    return 1.0 / max(3.0, min(rate, 8.0))


def _is_htmlish(content_type: str) -> bool:
    ct = content_type.lower()
    return ct.startswith("text/") or "html" in ct or "xml" in ct or "json" in ct or not ct


class Fetch:
    __slots__ = ("status", "text", "hops", "final", "ms", "content_type", "content")

    def __init__(self, status: int, text: str, hops: int, final: str, ms: int, content_type: str, content: bytes) -> None:
        self.status = status
        self.text = text
        self.hops = hops
        self.final = final
        self.ms = ms
        self.content_type = content_type
        self.content = content


async def _get(client: httpx.AsyncClient, url: str) -> Fetch:
    assert_public_http_url(url)
    hops = 0
    current = url
    seen: set[str] = set()
    t0 = time.perf_counter()
    last = Fetch(0, "", 0, url, 0, "", b"")
    while hops < 10:
        if current in seen:
            break
        seen.add(current)
        try:
            res = await client.get(current, follow_redirects=False)
        except httpx.HTTPError:
            ms = int((time.perf_counter() - t0) * 1000)
            return Fetch(0, "", hops, current, ms, "", b"")
        ct = res.headers.get("content-type", "")
        text = res.text if _is_htmlish(ct) else ""
        last = Fetch(res.status_code, text, hops, current, 0, ct, res.content)
        if res.is_redirect:
            loc = res.headers.get("location")
            if not loc:
                break
            nxt = normalize_url(loc, current) or current
            current = nxt
            hops += 1
            last.hops = hops
            last.final = current
            continue
        if not last.text:
            last.text = res.text
        last.final = str(res.url) if res.url else current
        break
    last.ms = int((time.perf_counter() - t0) * 1000)
    last.hops = hops
    return last


def _bucket(status: int) -> str:
    if status >= 500 or status == 0:
        return "5xx"
    if status >= 400:
        return "4xx"
    if status >= 300:
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
    noindex = "noindex" in robots_meta
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
        ms=fetch.ms,
    )
    level = classify_issues(issues)
    counts[level] = counts.get(level, 0) + 1
    buckets[_bucket(fetch.status)] += 1
    snaps.append((sc, depth))
    if expect_html and title:
        titles.append(title.strip().lower())
    con.execute(
        """INSERT INTO snapshots(crawl_id, url, status, depth, title, h1, meta, canonical, score, issues, fetched_at, ms, final_url, robots_meta)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
        ),
    )
    links = parsed.get("links") if expect_html and fetch.status < 400 else []
    return list(links) if isinstance(links, list) else []


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
    canon_mis = 0
    rows = con.execute("SELECT issues FROM snapshots WHERE crawl_id=?", (crawl_id,)).fetchall()
    for row in rows:
        if row["issues"] and "canonical" in row["issues"].split(","):
            canon_mis += 1
    score = site_score(snaps) if snaps else None
    if dups:
        score = max(0, (score or 0) - min(15, dups * 2))
    crawled = len(snaps)
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
) -> dict:
    origin = origin.rstrip("/")
    assert_public_http_url(origin + "/")
    host_origin = origin
    crawl_id = crawl_id or str(uuid4())
    cap = min(SAFETY_CAP, max(1, max_pages or 20000))
    delay = _delay_s(rate)

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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with make_client(headers=headers, timeout=12.0) as client:
            queue: deque[tuple[str, int]] = deque()
            seen: set[str] = set()

            def enqueue(url: str, depth: int, base: str = origin + "/") -> None:
                if len(seen) >= cap:
                    return
                if depth > max_depth:
                    return
                norm = normalize_url(url, base)
                if not norm or norm in seen:
                    return
                if not same_host(norm, host_origin):
                    return
                if is_asset_url(norm):
                    return
                path = urlparse(norm).path or "/"
                if robots_blocks(path, disallow):
                    return
                seen.add(norm)
                queue.append((norm, depth))

            if kind == "url":
                target = (one_url or origin).strip()
                assert_public_http_url(target)
                if urlparse(target).hostname != urlparse(origin).hostname:
                    raise ValueError("urlMustMatchOrigin")
                enqueue(target, 0)
            else:
                enqueue(origin + "/", 0)
                for t in template_urls[:100]:
                    if t.strip():
                        enqueue(t.strip(), 1)

                try:
                    robots = await _get(client, origin + "/robots.txt")
                    await asyncio.sleep(delay)
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
                        fetch = await _get(client, sm)
                        await asyncio.sleep(delay)
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
                                enqueue(loc, 1, sm)
                for sm in nested[:80]:
                    try:
                        fetch = await _get(client, sm)
                        await asyncio.sleep(delay)
                    except ValueError:
                        continue
                    xml = _decode_maybe_gzip(fetch)
                    if fetch.status != 200:
                        continue
                    locs = extract_locs(xml)
                    sitemap_count += len(locs)
                    if kind == "site":
                        for loc in locs:
                            enqueue(loc, 1, sm)

            crawled = 0
            while queue and crawled < cap:
                url, depth = queue.popleft()
                try:
                    fetch = await _get(client, url)
                except ValueError:
                    continue
                expect_html = "html" in fetch.content_type.lower() or fetch.text.strip().startswith("<")
                if url.rstrip("/").endswith("robots.txt"):
                    expect_html = False
                links = _record_page(
                    con, crawl_id, url, fetch, depth, expect_html, snaps, buckets, counts, titles
                )
                times.append(fetch.ms)
                crawled += 1
                final = fetch.final or url
                if kind == "site" and expect_html and fetch.status < 400 and same_host(final, host_origin):
                    for href in links:
                        enqueue(href, depth + 1, final)
                found = max(sitemap_count, crawled + len(queue))
                if crawled % 2 == 0 or crawled == 1:
                    _progress(
                        con, crawl_id, snaps, buckets, counts, sitemap_count, titles, cap, False, times, found
                    )
                await asyncio.sleep(delay)

        found = max(sitemap_count, len(snaps))
        _progress(con, crawl_id, snaps, buckets, counts, sitemap_count, titles, cap, True, times, found)
    except Exception as exc:
        con.execute(
            "UPDATE crawls SET status=?, error=?, finished_at=? WHERE id=?",
            ("failed", str(exc)[:300], _now(), crawl_id),
        )
        con.commit()
        raise
    finally:
        con.close()

    return {"id": crawl_id, "status": "done", "pages": len(snaps), "sitemap_urls": sitemap_count}
