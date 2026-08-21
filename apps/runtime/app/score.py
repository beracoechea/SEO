from __future__ import annotations


def score_url(
    status: int,
    title: str,
    h1: str,
    meta: str,
    imgs: int = 0,
    imgs_no_alt: int = 0,
    hops: int = 0,
    onpage: bool = True,
    canonical_ok: bool = True,
    has_canonical: bool = True,
    noindex: bool = False,
    nofollow: bool = False,
    ms: int = 0,
) -> tuple[int, list[str]]:
    n = 100
    issues: list[str] = []
    if status >= 500:
        n -= 80
        issues.append("http5xx")
    elif status == 0:
        n -= 18
        issues.append("unreachable")
    elif status >= 400:
        n -= 50
        issues.append("http4xx")
    if hops >= 1:
        n -= 3
        issues.append("redirect")
    if hops >= 3:
        n -= 12
        issues.append("redirects")
    if onpage:
        if not title:
            n -= 15
            issues.append("title")
        elif len(title) > 70:
            n -= 4
            issues.append("titleLong")
        if not h1:
            n -= 8
            issues.append("h1")
        if not meta:
            n -= 5
            issues.append("meta")
        if imgs and imgs_no_alt:
            penalty = min(10, 2 * imgs_no_alt)
            n -= penalty
            issues.append("alt")
        if not has_canonical:
            n -= 6
            issues.append("canonical")
        elif not canonical_ok:
            n -= 12
            issues.append("canonical")
        if noindex:
            n -= 6
            issues.append("noindex")
        if nofollow:
            n -= 4
            issues.append("nofollow")
        if ms >= 2000:
            n -= 8
            issues.append("slow")
    return max(0, n), issues


def site_score(rows: list[tuple[int, int]]) -> int:
    """rows: (score, depth)"""
    if not rows:
        return 0
    num = 0.0
    den = 0.0
    for score, depth in rows:
        w = 1.0 / (1.0 + depth)
        num += score * w
        den += w
    return int(round(num / den)) if den else 0


def classify_issues(codes: list[str]) -> str:
    if any(c in codes for c in ("http5xx", "http4xx")):
        return "critical"
    if codes:
        return "warn"
    return "ok"
