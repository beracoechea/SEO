from __future__ import annotations

import os
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS crawls (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  score INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  urls_ok INTEGER DEFAULT 0,
  urls_3xx INTEGER DEFAULT 0,
  urls_4xx INTEGER DEFAULT 0,
  urls_5xx INTEGER DEFAULT 0,
  issue_critical INTEGER DEFAULT 0,
  issue_warn INTEGER DEFAULT 0,
  issue_ok INTEGER DEFAULT 0,
  sitemap_urls INTEGER DEFAULT 0,
  pages_crawled INTEGER DEFAULT 0,
  avg_ms INTEGER DEFAULT 0,
  dup_titles INTEGER DEFAULT 0,
  canonical_mismatch INTEGER DEFAULT 0,
  max_pages INTEGER DEFAULT 0,
  discovered INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_id TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  h1 TEXT,
  meta TEXT,
  canonical TEXT,
  score INTEGER NOT NULL,
  issues TEXT,
  fetched_at TEXT NOT NULL,
  ms INTEGER DEFAULT 0,
  final_url TEXT,
  robots_meta TEXT,
  hops INTEGER DEFAULT 0,
  redirect_status INTEGER DEFAULT 0,
  in_sitemap INTEGER DEFAULT 0,
  via_link INTEGER DEFAULT 0,
  via_sitemap INTEGER DEFAULT 0,
  robots_header TEXT,
  fetched INTEGER DEFAULT 1,
  rendered INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snaps_crawl ON snapshots(crawl_id);
CREATE INDEX IF NOT EXISTS idx_crawls_site ON crawls(site_id, started_at);
CREATE TABLE IF NOT EXISTS site_jobs (
  site_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  template_urls TEXT NOT NULL DEFAULT '[]',
  rate REAL NOT NULL DEFAULT 10,
  max_pages INTEGER NOT NULL DEFAULT 20000,
  max_depth INTEGER NOT NULL DEFAULT 8,
  interval TEXT NOT NULL DEFAULT 'off',
  next_run_at TEXT,
  updated_at TEXT NOT NULL,
  render_js TEXT NOT NULL DEFAULT 'auto'
);
CREATE TABLE IF NOT EXISTS crawl_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_queue_pending ON crawl_queue(id);
"""

EXTRA_COLS = {
    "crawls": {
        "pages_crawled": "INTEGER DEFAULT 0",
        "avg_ms": "INTEGER DEFAULT 0",
        "dup_titles": "INTEGER DEFAULT 0",
        "canonical_mismatch": "INTEGER DEFAULT 0",
        "max_pages": "INTEGER DEFAULT 0",
        "discovered": "INTEGER DEFAULT 0",
    },
    "snapshots": {
        "ms": "INTEGER DEFAULT 0",
        "final_url": "TEXT",
        "robots_meta": "TEXT",
        "hops": "INTEGER DEFAULT 0",
        "redirect_status": "INTEGER DEFAULT 0",
        "in_sitemap": "INTEGER DEFAULT 0",
        "via_link": "INTEGER DEFAULT 0",
        "via_sitemap": "INTEGER DEFAULT 0",
        "robots_header": "TEXT",
        "fetched": "INTEGER DEFAULT 1",
        "rendered": "INTEGER DEFAULT 0",
    },
    "site_jobs": {
        "render_js": "TEXT NOT NULL DEFAULT 'auto'",
    },
    "crawl_queue": {
        "sort": "INTEGER DEFAULT 0",
    },
}


def data_dir() -> Path:
    raw = os.getenv("DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(data_dir() / "runtime.sqlite", timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def _ensure_columns(con: sqlite3.Connection) -> None:
    for table, cols in EXTRA_COLS.items():
        existing = {row[1] for row in con.execute(f"PRAGMA table_info({table})")}
        for name, decl in cols.items():
            if name not in existing:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def init_db() -> None:
    con = connect()
    try:
        con.executescript(SCHEMA)
        _ensure_columns(con)
        con.execute(
            "UPDATE crawls SET status='failed', error='crawl.interrupted', finished_at=datetime('now') WHERE status='running'"
        )
        con.commit()
    finally:
        con.close()
