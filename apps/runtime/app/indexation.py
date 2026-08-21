from __future__ import annotations

from urllib.parse import urlparse, urlunparse


def url_key(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    u = urlparse(raw)
    path = (u.path or "/").rstrip("/") or "/"
    netloc = (u.netloc or "").lower()
    return urlunparse((u.scheme.lower(), netloc, path, "", u.query, ""))


def robots_directives(*parts: str) -> tuple[bool, bool]:
    blob = " ".join(p or "" for p in parts).lower()
    return "noindex" in blob, "nofollow" in blob


def _fetched(row: dict) -> bool:
    val = row.get("fetched")
    return val is None or int(val) == 1


def diff_rows(
    current: list[dict],
    previous: list[dict] | None,
) -> dict:
    if not previous:
        return {
            "previous_at": None,
            "counts": {
                "added": 0,
                "removed": 0,
                "new_404": 0,
                "recovered_404": 0,
                "new_noindex": 0,
                "title_changed": 0,
            },
            "removed": [],
            "flags": {},
        }
    cur_map = {url_key(r.get("url") or ""): r for r in current if _fetched(r)}
    prev_map = {url_key(r.get("url") or ""): r for r in previous if _fetched(r)}
    flags: dict[str, list[str]] = {}
    removed: list[dict] = []

    def mark(key: str, flag: str) -> None:
        flags.setdefault(key, []).append(flag)

    def is_4xx(row: dict) -> bool:
        st = int(row.get("status") or 0)
        return 400 <= st < 500

    def has_noindex(row: dict) -> bool:
        issues = str(row.get("issues") or "")
        meta = str(row.get("robots_meta") or "")
        header = str(row.get("robots_header") or "")
        return "noindex" in issues.split(",") or "noindex" in f"{meta} {header}".lower()

    for key, row in cur_map.items():
        old = prev_map.get(key)
        if not old:
            mark(key, "added")
            continue
        if is_4xx(row) and not is_4xx(old):
            mark(key, "new404")
        if not is_4xx(row) and is_4xx(old):
            mark(key, "recovered404")
        if has_noindex(row) and not has_noindex(old):
            mark(key, "newNoindex")
        ct = (row.get("title") or "").strip()
        ot = (old.get("title") or "").strip()
        if ct and ot and ct != ot:
            mark(key, "titleChanged")

    for key, old in prev_map.items():
        if key not in cur_map:
            gone = dict(old)
            gone["diff"] = "removed"
            gone["issues"] = ",".join([x for x in str(old.get("issues") or "").split(",") if x] + ["removed"])
            removed.append(gone)
            mark(key, "removed")

    counts = {
        "added": sum(1 for v in flags.values() if "added" in v),
        "removed": len(removed),
        "new_404": sum(1 for v in flags.values() if "new404" in v),
        "recovered_404": sum(1 for v in flags.values() if "recovered404" in v),
        "new_noindex": sum(1 for v in flags.values() if "newNoindex" in v),
        "title_changed": sum(1 for v in flags.values() if "titleChanged" in v),
    }
    return {"previous_at": None, "counts": counts, "removed": removed, "flags": flags}
