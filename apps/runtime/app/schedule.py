from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db import connect
from app.parse import assert_public_http_url

INTERVALS = {
    "off": None,
    "day": timedelta(days=1),
    "3days": timedelta(days=3),
    "week": timedelta(days=7),
    "month": timedelta(days=30),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_interval(value: str | None) -> str:
    key = (value or "off").strip()
    return key if key in INTERVALS else "off"


def add_interval(start: datetime, interval: str) -> datetime | None:
    delta = INTERVALS.get(normalize_interval(interval))
    if delta is None:
        return None
    return start + delta


def remember_site(
    site_id: str,
    *,
    origin: str,
    template_urls: list[str] | None = None,
    rate: float = 10,
    max_pages: int = 20000,
    max_depth: int = 8,
    interval: str | None = None,
) -> None:
    origin = origin.rstrip("/")
    assert_public_http_url(origin + "/")
    templates = json.dumps((template_urls or [])[:100])
    con = connect()
    try:
        row = con.execute("SELECT interval, next_run_at FROM site_jobs WHERE site_id=?", (site_id,)).fetchone()
        keep_interval = normalize_interval(interval if interval is not None else (row["interval"] if row else "off"))
        next_run = row["next_run_at"] if row else None
        if keep_interval == "off":
            next_run = None
        elif interval is not None and (not row or row["interval"] != keep_interval or not next_run):
            last = con.execute(
                """SELECT finished_at, started_at FROM crawls
                   WHERE site_id=? AND status IN ('done','failed')
                   ORDER BY started_at DESC LIMIT 1""",
                (site_id,),
            ).fetchone()
            base = parse_dt(last["finished_at"] if last and last["finished_at"] else (last["started_at"] if last else None))
            nxt = add_interval(base, keep_interval) if base else _now()
            next_run = _iso(nxt)
        con.execute(
            """INSERT INTO site_jobs(site_id, origin, template_urls, rate, max_pages, max_depth, interval, next_run_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(site_id) DO UPDATE SET
                 origin=excluded.origin,
                 template_urls=excluded.template_urls,
                 rate=excluded.rate,
                 max_pages=excluded.max_pages,
                 max_depth=excluded.max_depth,
                 interval=excluded.interval,
                 next_run_at=excluded.next_run_at,
                 updated_at=excluded.updated_at""",
            (
                site_id,
                origin,
                templates,
                float(rate or 10),
                int(max_pages or 20000),
                int(max_depth or 8),
                keep_interval,
                next_run,
                _iso(_now()),
            ),
        )
        con.commit()
    finally:
        con.close()


def replace_sites(sites: list[dict[str, Any]]) -> None:
    keep: list[str] = []
    for raw in sites:
        site_id = str(raw.get("id") or "").strip()
        origin = str(raw.get("origin") or "").strip()
        if not site_id or not origin:
            continue
        keep.append(site_id)
        remember_site(
            site_id,
            origin=origin,
            template_urls=list(raw.get("templateUrls") or []),
            rate=float(raw.get("rateLimit") or 10),
            max_pages=int(raw.get("maxPages") or 20000),
            max_depth=int(raw.get("maxDepth") or 8),
            interval=normalize_interval(str(raw.get("scanEvery") or "off")),
        )
    con = connect()
    try:
        if keep:
            q = ",".join("?" * len(keep))
            con.execute(f"DELETE FROM crawl_queue WHERE site_id NOT IN ({q})", keep)
            con.execute(f"DELETE FROM site_jobs WHERE site_id NOT IN ({q})", keep)
        else:
            con.execute("DELETE FROM crawl_queue")
            con.execute("DELETE FROM site_jobs")
        con.commit()
    finally:
        con.close()


def drop_site(site_id: str) -> None:
    con = connect()
    try:
        con.execute("DELETE FROM crawl_queue WHERE site_id=?", (site_id,))
        con.execute("DELETE FROM site_jobs WHERE site_id=?", (site_id,))
        con.commit()
    finally:
        con.close()


def enqueue(site_id: str, reason: str = "manual") -> bool:
    con = connect()
    try:
        running = con.execute(
            "SELECT site_id FROM crawls WHERE status='running' LIMIT 1",
        ).fetchone()
        if running and running["site_id"] == site_id:
            return False
        pending = con.execute("SELECT id FROM crawl_queue WHERE site_id=?", (site_id,)).fetchone()
        if pending:
            return False
        nxt = con.execute("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM crawl_queue").fetchone()
        con.execute(
            "INSERT INTO crawl_queue(site_id, reason, created_at, sort) VALUES (?,?,?,?)",
            (site_id, reason, _iso(_now()), int(nxt["n"] if nxt else 0)),
        )
        con.commit()
        return True
    finally:
        con.close()


def running_crawl() -> dict[str, str] | None:
    con = connect()
    try:
        row = con.execute("SELECT id, site_id FROM crawls WHERE status='running' LIMIT 1").fetchone()
        if not row:
            return None
        return {"id": row["id"], "site_id": row["site_id"]}
    finally:
        con.close()


def queued_ids() -> list[str]:
    con = connect()
    try:
        return [r["site_id"] for r in con.execute("SELECT site_id FROM crawl_queue ORDER BY sort ASC, id ASC").fetchall()]
    finally:
        con.close()


def dequeue(site_id: str) -> bool:
    con = connect()
    try:
        cur = con.execute("DELETE FROM crawl_queue WHERE site_id=?", (site_id,))
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


def _write_order(con: Any, order: list[str]) -> None:
    existing = {r["site_id"]: r for r in con.execute("SELECT * FROM crawl_queue").fetchall()}
    con.execute("DELETE FROM crawl_queue")
    for i, site_id in enumerate(order):
        row = existing.get(site_id)
        if row:
            con.execute(
                "INSERT INTO crawl_queue(site_id, reason, created_at, sort) VALUES (?,?,?,?)",
                (site_id, row["reason"], row["created_at"], i),
            )
        else:
            con.execute(
                "INSERT INTO crawl_queue(site_id, reason, created_at, sort) VALUES (?,?,?,?)",
                (site_id, "manual", _iso(_now()), i),
            )


def reorder(site_ids: list[str]) -> list[str]:
    pending = queued_ids()
    wanted = [s for s in site_ids if s in pending]
    rest = [s for s in pending if s not in wanted]
    order = wanted + rest
    con = connect()
    try:
        _write_order(con, order)
        con.commit()
    finally:
        con.close()
    return order


def preempt(next_site_id: str, current_site_id: str | None) -> bool:
    pending = queued_ids()
    if next_site_id not in pending:
        return False
    rest = [s for s in pending if s != next_site_id and s != current_site_id]
    order = [next_site_id]
    if current_site_id:
        order.append(current_site_id)
    order.extend(rest)
    con = connect()
    try:
        _write_order(con, order)
        con.commit()
    finally:
        con.close()
    return True


def running_site() -> str | None:
    crawl = running_crawl()
    return crawl["site_id"] if crawl else None


def enqueue_due() -> list[str]:
    now = _now()
    added: list[str] = []
    con = connect()
    try:
        rows = con.execute(
            "SELECT site_id, interval, next_run_at FROM site_jobs WHERE interval != 'off'",
        ).fetchall()
    finally:
        con.close()
    for row in rows:
        due = parse_dt(row["next_run_at"])
        if due is None or due > now:
            continue
        if enqueue(row["site_id"], "schedule"):
            added.append(row["site_id"])
    return added


def bump_next_run(site_id: str) -> None:
    con = connect()
    try:
        row = con.execute("SELECT interval FROM site_jobs WHERE site_id=?", (site_id,)).fetchone()
        if not row:
            return
        nxt = add_interval(_now(), row["interval"])
        con.execute(
            "UPDATE site_jobs SET next_run_at=?, updated_at=? WHERE site_id=?",
            (_iso(nxt), _iso(_now()), site_id),
        )
        con.commit()
    finally:
        con.close()


def pop_next() -> dict[str, Any] | None:
    if running_site():
        return None
    con = connect()
    try:
        row = con.execute("SELECT * FROM crawl_queue ORDER BY sort ASC, id ASC LIMIT 1").fetchone()
        if not row:
            return None
        job = con.execute("SELECT * FROM site_jobs WHERE site_id=?", (row["site_id"],)).fetchone()
        con.execute("DELETE FROM crawl_queue WHERE id=?", (row["id"],))
        con.commit()
        if not job:
            return None
        try:
            templates = json.loads(job["template_urls"] or "[]")
        except json.JSONDecodeError:
            templates = []
        return {
            "site_id": job["site_id"],
            "origin": job["origin"],
            "template_urls": templates if isinstance(templates, list) else [],
            "rate": job["rate"],
            "max_pages": job["max_pages"],
            "max_depth": job["max_depth"],
            "reason": row["reason"],
        }
    finally:
        con.close()


def snapshot() -> dict[str, Any]:
    con = connect()
    try:
        jobs = [dict(r) for r in con.execute("SELECT site_id, interval, next_run_at FROM site_jobs").fetchall()]
        queue = [
            dict(r)
            for r in con.execute("SELECT id, site_id, reason, created_at, sort FROM crawl_queue ORDER BY sort ASC, id ASC").fetchall()
        ]
        return {
            "schedules": {j["site_id"]: {"interval": j["interval"], "next_run_at": j["next_run_at"]} for j in jobs},
            "queue": queue,
        }
    finally:
        con.close()
