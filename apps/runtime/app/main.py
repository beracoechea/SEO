from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import __version__
from app.crawler import run_crawl
from app.db import connect, init_db
from app.indexation import diff_rows, url_key
from app.parse import assert_public_http_url

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SEO runtime", version=__version__, lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
for part in os.getenv("CORS_ORIGIN", "").split(","):
    extra = part.strip().rstrip("/")
    if extra and extra not in origins:
        origins.append(extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    rateLimit: float = 4
    maxPages: int = 20000
    maxDepth: int = 8


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    org = os.getenv("ORG_ID", "")
    suffix = org[-6:] if len(org) >= 6 else org
    return {"ok": True, "version": __version__, "org_id_suffix": suffix}


@app.get("/api/me")
def me(user: dict = Depends(require_user)) -> dict:
    return {"ok": True, **user}


async def _run_job(**kwargs) -> None:
    try:
        await run_crawl(**kwargs)
    except Exception:
        pass


@app.post("/api/sites/{site_id}/crawls")
async def create_crawl(
    site_id: str,
    body: CrawlIn,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_user),
) -> dict:
    con = connect()
    try:
        row = con.execute(
            "SELECT id, site_id FROM crawls WHERE status='running' LIMIT 1",
        ).fetchone()
    finally:
        con.close()
    if row:
        raise HTTPException(status_code=409, detail="crawl.alreadyRunning")
    try:
        assert_public_http_url(body.origin.rstrip("/") + "/")
        if body.kind == "url" and body.url:
            assert_public_http_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    crawl_id = str(uuid4())
    con = connect()
    try:
        con.execute(
            "INSERT INTO crawls(id, site_id, kind, status, started_at, max_pages) VALUES (?,?,?,?,?,?)",
            (crawl_id, site_id, body.kind, "running", datetime.now(timezone.utc).isoformat(), min(50000, max(1, body.maxPages))),
        )
        con.commit()
    finally:
        con.close()
    kwargs = {
        "site_id": site_id,
        "kind": body.kind,
        "origin": body.origin,
        "template_urls": body.templateUrls,
        "one_url": body.url,
        "rate": body.rateLimit,
        "max_pages": body.maxPages,
        "max_depth": body.maxDepth,
        "crawl_id": crawl_id,
    }
    try:
        if os.getenv("CRAWL_NO_DELAY") == "1":
            result = await run_crawl(**kwargs)
            return {"ok": True, "crawl": result, "uid": user.get("uid")}
        background_tasks.add_task(_run_job, **kwargs)
        return {"ok": True, "crawl": {"id": crawl_id, "status": "running"}, "uid": user.get("uid")}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
                      in_sitemap, via_link, via_sitemap, robots_header, fetched
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
        return {
            "ok": True,
            "sites": [dict(r) for r in rows],
            "history": history,
            "active": dict(active) if active else None,
        }
    finally:
        con.close()
