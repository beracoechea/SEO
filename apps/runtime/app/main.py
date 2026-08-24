from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import Response

from app import __version__
from app import schedule as sched
from app.crawler import clear_cancel, crawl_cancelled, request_cancel, run_crawl
from app.db import checkpoint_wal, connect, init_db
from app.indexation import diff_rows, url_key
from app.parse import assert_public_http_url

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_job_lock = asyncio.Lock()


async def _finish_crawl(site_id: str, crawl_id: str, origin: str, *, interrupted: bool) -> None:
    if interrupted:
        return
    sched.bump_next_run(site_id)


async def _run_job(**kwargs) -> None:
    crawl_id = str(kwargs.get("crawl_id") or "")
    site_id = str(kwargs.get("site_id") or "")
    origin = str(kwargs.get("origin") or "")
    try:
        await run_crawl(**kwargs)
    except Exception:
        pass
    finally:
        interrupted = crawl_cancelled(crawl_id)
        clear_cancel(crawl_id)
        await _finish_crawl(site_id, crawl_id, origin, interrupted=interrupted)
        await pump_queue()


async def pump_queue() -> None:
    async with _job_lock:
        if os.getenv("CRAWL_NO_DELAY") == "1":
            return
        nxt = sched.pop_next()
        if not nxt:
            return
        _spawn_crawl(
            site_id=nxt["site_id"],
            kind="site",
            origin=nxt["origin"],
            template_urls=nxt["template_urls"],
            one_url=None,
            rate=float(nxt["rate"] or 10),
            max_pages=int(nxt["max_pages"] or 20000),
            max_depth=int(nxt["max_depth"] or 8),
            render_js=nxt.get("render_js") or "auto",
        )


def _spawn_crawl(**kwargs) -> dict:
    crawl_id = kwargs.get("crawl_id") or str(uuid4())
    kwargs["crawl_id"] = crawl_id
    con = connect()
    try:
        con.execute(
            "INSERT INTO crawls(id, site_id, kind, status, started_at, max_pages) VALUES (?,?,?,?,?,?)",
            (
                crawl_id,
                kwargs["site_id"],
                kwargs["kind"],
                "running",
                datetime.now(timezone.utc).isoformat(),
                min(50000, max(1, int(kwargs.get("max_pages") or 20000))),
            ),
        )
        con.commit()
    finally:
        con.close()
    if os.getenv("CRAWL_NO_DELAY") == "1":
        # tests await the crawl inline
        return {"id": crawl_id, "mode": "sync", "kwargs": kwargs}
    asyncio.create_task(_run_job(**kwargs))
    return {"id": crawl_id, "status": "running"}


async def _scheduler_loop() -> None:
    while True:
        try:
            sched.enqueue_due()
            await pump_queue()
        except Exception:
            pass
        await asyncio.sleep(20)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    task = None
    if os.getenv("CRAWL_NO_DELAY") != "1":
        task = asyncio.create_task(_scheduler_loop())
    try:
        yield
    finally:
        if task:
            task.cancel()
        try:
            checkpoint_wal()
        except Exception:
            pass


app = FastAPI(title="SEO runtime", version=__version__, lifespan=lifespan)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://bgx-seo-monitor.web.app",
    "https://bgx-seo-monitor.firebaseapp.com",
)


def cors_allow_origins(raw: str | None = None) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    extra = raw if raw is not None else os.getenv("CORS_ORIGIN", "")
    for part in (*DEFAULT_CORS_ORIGINS, *extra.split(",")):
        origin = part.strip().rstrip("/")
        if origin and origin not in seen:
            seen.add(origin)
            merged.append(origin)
    return merged


origins = cors_allow_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_private_network(request: Request, call_next):
    if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network"):
        origin = (request.headers.get("origin") or "").rstrip("/")
        allowed = origin in {o.rstrip("/") for o in origins}
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": origin if allowed else ", ".join(origins[:1]),
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "*"),
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Private-Network": "true",
            },
        )
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network"):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


def require_user(authorization: str | None = Header(default=None)) -> dict:
    if os.getenv("ALLOW_ANON") == "1":
        return {"uid": "anon"}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing-token")
    token = authorization.split(" ", 1)[1].strip()
    project = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    try:
        from google.auth.transport import requests as greq
        from google.oauth2 import id_token

        info = id_token.verify_firebase_token(token, greq.Request(), audience=project or None)
        return {"uid": info.get("uid") or info.get("sub") or "", "email": info.get("email") or ""}
    except Exception:
        raise HTTPException(status_code=401, detail="invalid-token") from None


class CrawlIn(BaseModel):
    kind: str = Field(default="site", pattern="^(site|templates|url)$")
    origin: str
    templateUrls: list[str] = []
    url: str | None = None
    rateLimit: float = 10
    maxPages: int = 20000
    maxDepth: int = 8
    scanEvery: str | None = None
    renderJs: str = "auto"


class ScheduleSiteIn(BaseModel):
    id: str
    origin: str
    templateUrls: list[str] = []
    rateLimit: float = 10
    maxPages: int = 20000
    maxDepth: int = 8
    scanEvery: str = "off"
    renderJs: str = "auto"


class ScheduleIn(BaseModel):
    sites: list[ScheduleSiteIn] = []


class QueueReorderIn(BaseModel):
    siteIds: list[str] = []


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    org = os.getenv("ORG_ID", "")
    suffix = org[-6:] if len(org) >= 6 else org
    busy = False
    try:
        busy = sched.running_crawl() is not None
    except Exception:
        busy = False
    return {
        "ok": True,
        "version": __version__,
        "org_id_suffix": suffix,
        "queue": True,
        "js": True,
        "busy": busy,
    }


@app.get("/api/me")
def me(user: dict = Depends(require_user)) -> dict:
    return {"ok": True, **user}


@app.put("/api/schedule")
def put_schedule(body: ScheduleIn, user: dict = Depends(require_user)) -> dict:
    try:
        sched.replace_sites([s.model_dump() for s in body.sites])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    snap = sched.snapshot()
    return {"ok": True, **snap, "uid": user.get("uid")}


@app.delete("/api/queue/{site_id}")
def cancel_queued(site_id: str, user: dict = Depends(require_user)) -> dict:
    if not sched.dequeue(site_id):
        raise HTTPException(status_code=404, detail="queue.missing")
    snap = sched.snapshot()
    return {"ok": True, **snap, "uid": user.get("uid")}


@app.post("/api/queue/reorder")
def reorder_queue(body: QueueReorderIn, user: dict = Depends(require_user)) -> dict:
    sched.reorder(body.siteIds)
    snap = sched.snapshot()
    return {"ok": True, **snap, "uid": user.get("uid")}


@app.post("/api/queue/{site_id}/run-now")
async def run_queued_now(site_id: str, user: dict = Depends(require_user)) -> dict:
    if site_id not in sched.queued_ids():
        raise HTTPException(status_code=404, detail="queue.missing")
    current = sched.running_crawl()
    if current:
        request_cancel(current["id"])
        sched.preempt(site_id, current["site_id"])
    else:
        sched.reorder([site_id])
        await pump_queue()
    snap = sched.snapshot()
    return {"ok": True, **snap, "uid": user.get("uid")}


@app.post("/api/sites/{site_id}/crawls")
async def create_crawl(
    site_id: str,
    body: CrawlIn,
    user: dict = Depends(require_user),
) -> dict:
    try:
        assert_public_http_url(body.origin.rstrip("/") + "/")
        if body.kind == "url" and body.url:
            assert_public_http_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        sched.remember_site(
            site_id,
            origin=body.origin,
            template_urls=body.templateUrls,
            rate=body.rateLimit,
            max_pages=body.maxPages,
            max_depth=body.maxDepth,
            interval=body.scanEvery,
            render_js=body.renderJs,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    busy = sched.running_site()
    if busy:
        already_queued = site_id in sched.queued_ids()
        queued = already_queued or (busy != site_id and sched.enqueue(site_id, "manual"))
        snap = sched.snapshot()
        return {
            "ok": True,
            "queued": queued,
            "crawl": {"id": None, "status": "queued" if queued else "running"},
            "queue": snap["queue"],
            "uid": user.get("uid"),
        }
    launched = _spawn_crawl(
        site_id=site_id,
        kind=body.kind,
        origin=body.origin,
        template_urls=body.templateUrls,
        one_url=body.url,
        rate=body.rateLimit,
        max_pages=body.maxPages,
        max_depth=body.maxDepth,
        render_js=body.renderJs,
    )
    if launched.get("mode") == "sync":
        try:
            result = await run_crawl(**launched["kwargs"])
            await _finish_crawl(site_id, launched["id"], body.origin, interrupted=False)
            return {"ok": True, "queued": False, "crawl": result, "uid": user.get("uid")}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "queued": False, "crawl": {"id": launched["id"], "status": "running"}, "uid": user.get("uid")}


@app.get("/api/sites/{site_id}/summary")
def site_summary(site_id: str, user: dict = Depends(require_user)) -> dict:
    con = connect()
    try:
        crawl = con.execute(
            "SELECT * FROM crawls WHERE site_id=? ORDER BY started_at DESC LIMIT 1",
            (site_id,),
        ).fetchone()
        if not crawl:
            return {"ok": True, "crawl": None, "pages": []}
        snaps = con.execute(
            """SELECT url, status, title, h1, meta, canonical, score, issues, depth, ms, final_url, robots_meta, hops, redirect_status,
                      in_sitemap, via_link, via_sitemap, robots_header, fetched, rendered
               FROM snapshots WHERE crawl_id=? ORDER BY depth, url""",
            (crawl["id"],),
        ).fetchall()
        pages = [dict(s) for s in snaps]
        prev = con.execute(
            """SELECT id, finished_at FROM crawls
               WHERE site_id=? AND status='done' AND id!=? AND finished_at IS NOT NULL
               ORDER BY started_at DESC LIMIT 1""",
            (site_id, crawl["id"]),
        ).fetchone()
        diff = None
        if prev:
            prev_snaps = con.execute(
                """SELECT url, status, title, issues, robots_meta, robots_header, fetched, hops, redirect_status, in_sitemap
                   FROM snapshots WHERE crawl_id=?""",
                (prev["id"],),
            ).fetchall()
            built = diff_rows(pages, [dict(p) for p in prev_snaps])
            built["previous_at"] = prev["finished_at"]
            flag_map = built["flags"]
            for page in pages:
                marks = flag_map.get(url_key(page.get("url") or ""), [])
                if marks:
                    page["diff"] = ",".join(marks)
            for gone in built["removed"]:
                gone["diff"] = "removed"
            pages.extend(built["removed"])
            diff = {"previous_at": built["previous_at"], "counts": built["counts"]}
        return {
            "ok": True,
            "crawl": dict(crawl),
            "pages": pages,
            "diff": diff,
        }
    finally:
        con.close()


@app.get("/api/sites")
def list_summaries(user: dict = Depends(require_user)) -> dict:
    con = connect()
    try:
        rows = con.execute(
            """SELECT c.* FROM crawls c
               JOIN (SELECT site_id, MAX(started_at) AS f FROM crawls GROUP BY site_id) t
               ON c.site_id=t.site_id AND c.started_at=t.f"""
        ).fetchall()
        hist_rows = con.execute(
            """SELECT site_id, score, finished_at, pages_crawled, started_at
               FROM crawls WHERE status='done' AND score IS NOT NULL
               ORDER BY finished_at DESC"""
        ).fetchall()
        history: dict[str, list[dict]] = {}
        for h in hist_rows:
            bucket = history.setdefault(h["site_id"], [])
            if len(bucket) >= 5:
                continue
            bucket.append(dict(h))
        active = con.execute("SELECT * FROM crawls WHERE status='running' LIMIT 1").fetchone()
        snap = sched.snapshot()
        return {
            "ok": True,
            "sites": [dict(r) for r in rows],
            "history": history,
            "active": dict(active) if active else None,
            "queue": snap["queue"],
            "schedules": snap["schedules"],
        }
    finally:
        con.close()
