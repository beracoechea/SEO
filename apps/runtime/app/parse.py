from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse

ASSET_EXT = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".css",
    ".js",
    ".mjs",
    ".map",
    ".zip",
    ".rar",
    ".mp4",
    ".mp3",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".xml.gz",
}

LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


class _Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.h1 = ""
        self.meta = ""
        self.canonical = ""
        self.robots_meta = ""
        self._in_title = False
        self._in_h1 = False
        self.imgs = 0
        self.imgs_no_alt = 0
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title":
            self._in_title = True
        elif tag == "h1" and not self.h1:
            self._in_h1 = True
        elif tag == "meta":
            name = ad.get("name", "").lower()
            prop = ad.get("property", "").lower()
            if name == "description" or prop == "og:description":
                self.meta = ad.get("content", "").strip() or self.meta
            if name == "robots":
                self.robots_meta = ad.get("content", "").lower()
        elif tag == "link" and "canonical" in ad.get("rel", "").lower().split():
            self.canonical = ad.get("href", "").strip()
        elif tag == "img":
            self.imgs += 1
            if not ad.get("alt", "").strip():
                self.imgs_no_alt += 1
        elif tag == "a":
            href = ad.get("href", "").strip()
            if href:
                self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag == "h1":
            self._in_h1 = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        if self._in_h1:
            self.h1 += data


def parse_html(html: str) -> dict[str, str | int | list[str]]:
    p = _Page()
    try:
        p.feed(html)
    except Exception:
        pass
    return {
        "title": p.title.strip(),
        "h1": p.h1.strip(),
        "meta": p.meta.strip(),
        "canonical": p.canonical.strip(),
        "robots_meta": p.robots_meta.strip(),
        "imgs": p.imgs,
        "imgs_no_alt": p.imgs_no_alt,
        "links": p.links,
    }


def parse_robots_sitemaps(origin: str, body: str) -> list[str]:
    out: list[str] = []
    for line in body.splitlines():
        if line.lower().startswith("sitemap:"):
            raw = line.split(":", 1)[1].strip()
            if raw:
                out.append(urljoin(origin + "/", raw))
    return out


def parse_robots_disallow(body: str) -> list[str]:
    """Disallow rules from the User-agent: * (or first) group."""
    rules: list[str] = []
    in_star = False
    seen_agent = False
    for raw in body.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip()
            in_star = agent == "*"
            seen_agent = True
            continue
        if lower.startswith("disallow:") and (in_star or not seen_agent):
            path = line.split(":", 1)[1].strip()
            if path:
                rules.append(path)
    return rules


def robots_blocks(path: str, rules: list[str]) -> bool:
    for rule in rules:
        if rule == "/":
            continue
        if path.startswith(rule):
            return True
    return False


def extract_locs(xml: str) -> list[str]:
    return [m.strip() for m in LOC_RE.findall(xml) if m.strip()]


def is_sitemap_index(xml: str) -> bool:
    return "<sitemapindex" in xml.lower()


def count_sitemap_locs(xml: str) -> int:
    if is_sitemap_index(xml):
        return 0
    return len(extract_locs(xml))


def is_private_host(host: str) -> bool:
    h = host.lower()
    if h in {"localhost", "127.0.0.1", "::1"} or h.endswith(".local"):
        return True
    parts = h.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        a, b = int(parts[0]), int(parts[1])
        if a == 10 or a == 127 or (a == 192 and b == 168) or (a == 172 and 16 <= b <= 31):
            return True
        if h == "169.254.169.254":
            return True
    return False


def assert_public_http_url(url: str) -> None:
    u = urlparse(url)
    if u.scheme not in {"http", "https"} or not u.hostname or is_private_host(u.hostname):
        raise ValueError("originForbidden")


def is_asset_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in ASSET_EXT)


def normalize_url(url: str, base: str) -> str | None:
    raw = url.strip()
    if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    abs_url = urljoin(base, raw)
    u = urlparse(abs_url)
    if u.scheme not in {"http", "https"} or not u.hostname:
        return None
    path = u.path or "/"
    netloc = u.netloc.lower()
    return urlunparse((u.scheme, netloc, path, "", u.query, ""))


def same_host(url: str, origin: str) -> bool:
    a = urlparse(url).hostname
    b = urlparse(origin).hostname
    return bool(a and b and a.lower() == b.lower())


def canonical_matches(page_url: str, canonical: str) -> bool:
    if not canonical:
        return True
    abs_c = normalize_url(canonical, page_url)
    page = normalize_url(page_url, page_url)
    if not abs_c or not page:
        return True
    return abs_c.rstrip("/") == page.rstrip("/")
