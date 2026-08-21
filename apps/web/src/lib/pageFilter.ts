import type { HttpMix } from "./score";
import type { PageSnap } from "./runtime";

export type PageFilter =
  | "all"
  | "http200"
  | "http3xx"
  | "http4xx"
  | "http5xx"
  | "critical"
  | "warning"
  | "ok"
  | "sitemap"
  | "slow"
  | "dupTitles";

export type PageHttpClass = "ok" | "redirect" | "client" | "server";

function stripUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

export function issueCodes(page: PageSnap): string[] {
  return (page.issues || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pageHadRedirect(page: PageSnap): boolean {
  if ((page.hops || 0) >= 1) return true;
  const code = page.redirect_status || 0;
  if (code >= 300 && code < 400) return true;
  const from = stripUrl(page.url || "");
  const to = stripUrl(page.final_url || "");
  return Boolean(from && to && from !== to);
}

export function pageHttpClass(page: PageSnap): PageHttpClass {
  const status = page.status || 0;
  if (status === 0 || status >= 500) return "server";
  if (status >= 400) return "client";
  if ((status >= 300 && status < 400) || pageHadRedirect(page)) return "redirect";
  return "ok";
}

export function httpMixFromPages(pages: PageSnap[]): HttpMix {
  const mix: HttpMix = { ok: 0, redirect: 0, client: 0, server: 0 };
  for (const page of pages) mix[pageHttpClass(page)] += 1;
  return mix;
}

export function isCriticalPage(page: PageSnap): boolean {
  return issueCodes(page).some((c) => c === "http4xx" || c === "http5xx");
}

export function isWarningPage(page: PageSnap): boolean {
  const codes = issueCodes(page);
  return codes.length > 0 && !isCriticalPage(page);
}

export function duplicateTitles(pages: PageSnap[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    const key = (p.title || "").trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

export function findingCounts(pages: PageSnap[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const page of pages) {
    for (const code of issueCodes(page)) {
      counts[code] = (counts[code] || 0) + 1;
    }
  }
  return counts;
}

export function filterPages(pages: PageSnap[], filter: PageFilter): PageSnap[] {
  const dups = filter === "dupTitles" ? duplicateTitles(pages) : null;
  const avg =
    filter === "slow"
      ? pages.reduce((s, p) => s + (p.ms || 0), 0) / Math.max(pages.length, 1)
      : 0;
  return pages.filter((p) => {
    const klass = pageHttpClass(p);
    const codes = issueCodes(p);
    switch (filter) {
      case "all":
      case "sitemap":
        return true;
      case "http200":
        return klass === "ok";
      case "http3xx":
        return klass === "redirect";
      case "http4xx":
        return klass === "client";
      case "http5xx":
        return klass === "server";
      case "critical":
        return isCriticalPage(p);
      case "warning":
        return isWarningPage(p);
      case "ok":
        return codes.length === 0 && klass === "ok";
      case "slow":
        return codes.includes("slow") || (p.ms || 0) >= Math.max(avg, 2000);
      case "dupTitles": {
        const key = (p.title || "").trim().toLowerCase();
        return Boolean(key && dups?.has(key));
      }
      default:
        return true;
    }
  });
}
