from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone

from urllib.parse import urlparse

import httpx

from app.db import connect
from app.indexation import diff_rows, url_key
from app.parse import assert_public_http_url

MAX_URLS = 20
MAX_EMAILS = 8


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_setting(key: str, default: str = "") -> str:
    con = connect()
    try:
        row = con.execute("SELECT v FROM runtime_settings WHERE k=?", (key,)).fetchone()
        return str(row["v"]) if row else default
    finally:
        con.close()


def set_setting(key: str, value: str) -> None:
    con = connect()
    try:
        con.execute(
            "INSERT INTO runtime_settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
            (key, value),
        )
        con.commit()
    finally:
        con.close()


def normalize_emails(raw: str) -> str:
    seen: list[str] = []
    for part in (raw or "").replace(";", ",").split(","):
        addr = part.strip().lower()
        if not addr or "@" not in addr or "." not in addr.split("@")[-1]:
            continue
        if addr in seen:
            continue
        seen.append(addr)
        if len(seen) >= MAX_EMAILS:
            break
    return ",".join(seen)


def normalize_webhook(raw: str) -> str:
    url = (raw or "").strip()
    if not url:
        return ""
    assert_public_http_url(url)
    return url


def get_alerts() -> dict[str, str]:
    return {
        "webhook": get_setting("alert_webhook"),
        "email": get_setting("alert_email"),
    }


def save_alerts(webhook: str | None, email: str | None) -> dict[str, str]:
    if webhook is not None:
        set_setting("alert_webhook", normalize_webhook(webhook))
    if email is not None:
        set_setting("alert_email", normalize_emails(email))
    return get_alerts()


def already_sent(crawl_id: str) -> bool:
    if not crawl_id:
        return True
    con = connect()
    try:
        row = con.execute("SELECT crawl_id FROM alerts_sent WHERE crawl_id=?", (crawl_id,)).fetchone()
        return bool(row)
    finally:
        con.close()


def mark_sent(crawl_id: str) -> None:
    con = connect()
    try:
        con.execute(
            "INSERT OR IGNORE INTO alerts_sent(crawl_id, sent_at) VALUES(?, ?)",
            (crawl_id, _now()),
        )
        con.commit()
    finally:
        con.close()


def _new_404_urls(site_id: str, crawl_id: str) -> tuple[int, list[str]]:
    con = connect()
    try:
        crawl = con.execute(
            "SELECT id, status FROM crawls WHERE id=? AND site_id=?",
            (crawl_id, site_id),
        ).fetchone()
        if not crawl or crawl["status"] != "done":
            return 0, []
        current = [
            dict(r)
            for r in con.execute(
                "SELECT url, status, title, issues, robots_meta, robots_header, fetched FROM snapshots WHERE crawl_id=?",
                (crawl_id,),
            ).fetchall()
        ]
        prev = con.execute(
            """SELECT id FROM crawls
               WHERE site_id=? AND status='done' AND id!=? AND finished_at IS NOT NULL
               ORDER BY started_at DESC LIMIT 1""",
            (site_id, crawl_id),
        ).fetchone()
        if not prev:
            return 0, []
        previous = [
            dict(r)
            for r in con.execute(
                "SELECT url, status, title, issues, robots_meta, robots_header, fetched FROM snapshots WHERE crawl_id=?",
                (prev["id"],),
            ).fetchall()
        ]
    finally:
        con.close()
    built = diff_rows(current, previous)
    count = int(built["counts"].get("new_404") or 0)
    flagged = {k for k, flags in built["flags"].items() if "new404" in flags}
    urls: list[str] = []
    for row in current:
        key = url_key(row.get("url") or "")
        if key in flagged:
            urls.append(str(row.get("url") or key))
            if len(urls) >= MAX_URLS:
                break
    return count, urls


def _org_suffix() -> str:
    org = os.getenv("ORG_ID", "")
    return org[-6:] if len(org) >= 6 else org


def build_payload(site_id: str, crawl_id: str, origin: str, count: int, urls: list[str], emails: list[str]) -> dict:
    return {
        "event": "new_404",
        "org_id_suffix": _org_suffix(),
        "site_id": site_id,
        "origin": origin,
        "crawl_id": crawl_id,
        "new_404": count,
        "urls": urls,
        "emails": emails,
        "at": _now(),
    }


def _plain_message(origin: str, count: int, urls: list[str]) -> str:
    lines = [
        f"SEO técnico: {count} URL(s) nuevas en 404 en {origin}.",
        "Esto sale del motor en la planta (sin Firebase).",
        "",
        "Ejemplos:",
    ]
    lines.extend(f"  - {u}" for u in urls)
    if count > len(urls):
        lines.append(f"  … y {count - len(urls)} más en el panel LAN.")
    return "\n".join(lines)


def webhook_request(url: str, payload: dict) -> tuple[dict[str, str], dict | None, bytes | None]:
    """Pick a free channel format (Discord / Teams / ntfy / Telegram) or generic JSON."""
    host = (urlparse(url).hostname or "").lower()
    text = _plain_message(str(payload.get("origin") or ""), int(payload.get("new_404") or 0), list(payload.get("urls") or []))
    headers = {"User-Agent": "logicbus-seo-runtime/alerts"}
    if "discord.com" in host or "discordapp.com" in host:
        return {**headers, "Content-Type": "application/json"}, {"content": text[:1900]}, None
    if "webhook.office.com" in host or "office.com" in host or "office365.com" in host:
        return {**headers, "Content-Type": "application/json"}, {"text": text[:4000]}, None
    if host == "ntfy.sh" or host.endswith(".ntfy.sh") or host.startswith("ntfy."):
        return {
            **headers,
            "Title": f"SEO: {payload.get('new_404')} 404 nuevos",
            "Tags": "warning,skull",
            "Content-Type": "text/plain; charset=utf-8",
        }, None, text.encode("utf-8")
    if "telegram.org" in host or "t.me" in host:
        return {**headers, "Content-Type": "application/json"}, {"text": text[:4000]}, None
    return {**headers, "Content-Type": "application/json"}, payload, None


async def post_webhook(url: str, payload: dict) -> None:
    headers, json_body, raw = webhook_request(url, payload)
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        if raw is not None:
            await client.post(url, content=raw, headers=headers)
        else:
            await client.post(url, json=json_body, headers=headers)


def send_email(to: list[str], subject: str, body: str) -> None:
    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host or not to:
        return
    port = int(os.getenv("SMTP_PORT") or "587")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASS") or ""
    sender = (os.getenv("SMTP_FROM") or user or "seo-runtime@localhost").strip()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    msg.set_content(body)
    use_ssl = (os.getenv("SMTP_SSL") or "").strip() in {"1", "true", "yes"}
    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=12) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return
    with smtplib.SMTP(host, port, timeout=12) as smtp:
        smtp.ehlo()
        if (os.getenv("SMTP_TLS") or "1").strip() not in {"0", "false", "no"}:
            smtp.starttls()
            smtp.ehlo()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def _email_body(origin: str, count: int, urls: list[str]) -> str:
    return _plain_message(origin, count, urls) + "\n\nAbre Sitios en la cáscara (misma LAN) para el listado completo."


async def notify_if_new_404(site_id: str, crawl_id: str, origin: str) -> dict | None:
    if already_sent(crawl_id):
        return None
    cfg = get_alerts()
    webhook = cfg["webhook"]
    emails = [e for e in cfg["email"].split(",") if e]
    if not webhook and not emails:
        return None
    count, urls = _new_404_urls(site_id, crawl_id)
    if count <= 0:
        return None
    payload = build_payload(site_id, crawl_id, origin, count, urls, emails)
    sent = False
    if webhook:
        try:
            await post_webhook(webhook, payload)
            sent = True
        except Exception:
            pass
    smtp = (os.getenv("SMTP_HOST") or "").strip()
    if emails and smtp:
        try:
            send_email(
                emails,
                f"SEO: {count} 404 nuevos en {origin}",
                _email_body(origin, count, urls),
            )
            sent = True
        except Exception:
            pass
    if sent:
        mark_sent(crawl_id)
        return payload
    return None
