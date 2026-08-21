import { getFirebaseAuth } from "./firebase";

export type CrawlRow = {
  id: string;
  site_id: string;
  kind: string;
  status: string;
  score: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  urls_ok: number;
  urls_3xx: number;
  urls_4xx: number;
  urls_5xx: number;
  issue_critical: number;
  issue_warn: number;
  issue_ok: number;
  sitemap_urls: number;
  pages_crawled: number;
  avg_ms: number;
  dup_titles: number;
  canonical_mismatch: number;
  max_pages: number;
  discovered?: number;
};

export type CrawlHistoryPoint = {
  site_id?: string;
  score: number | null;
  finished_at: string | null;
  pages_crawled: number;
  started_at?: string;
};

export type RuntimeOverview = {
  sites: CrawlRow[];
  history: Record<string, CrawlHistoryPoint[]>;
  active: CrawlRow | null;
};

export type CrawlDiff = {
  previous_at: string | null;
  counts: {
    added: number;
    removed: number;
    new_404: number;
    recovered_404: number;
    new_noindex: number;
    title_changed: number;
  };
};

export type PageSnap = {
  url: string;
  status: number;
  title: string | null;
  h1: string | null;
  meta: string | null;
  canonical: string | null;
  score: number;
  issues: string;
  depth: number;
  ms?: number;
  final_url?: string | null;
  robots_meta?: string | null;
  hops?: number;
  redirect_status?: number;
  in_sitemap?: number;
  via_link?: number;
  via_sitemap?: number;
  robots_header?: string | null;
  fetched?: number;
  diff?: string;
};

export function resolvedRuntimeUrl(orgUrl?: string | null): string {
  const stored = (orgUrl || "").trim().replace(/\/$/, "");
  if (stored && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(stored)) {
    return stored;
  }
  if (import.meta.env.DEV) return "/runtime";
  const env = (import.meta.env.VITE_RUNTIME_URL || "").trim().replace(/\/$/, "");
  if (env) return env;
  return "/runtime";
}

function base(url: string) {
  return url.replace(/\/$/, "");
}

export async function runtimeToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("missing-token");
  return user.getIdToken();
}

async function runtimeFetch(runtimeUrl: string, path: string, init?: RequestInit) {
  const token = await runtimeToken();
  const res = await fetch(`${base(runtimeUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body ? String((body as { detail: unknown }).detail) : res.statusText;
    const err = new Error(detail);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return body as Record<string, unknown>;
}

export async function startCrawl(
  runtimeUrl: string,
  siteId: string,
  input: {
    kind?: "site" | "templates" | "url";
    origin: string;
    templateUrls?: string[];
    url?: string;
    rateLimit?: number;
    maxPages?: number;
    maxDepth?: number;
  },
) {
  return runtimeFetch(runtimeUrl, `/api/sites/${encodeURIComponent(siteId)}/crawls`, {
    method: "POST",
    body: JSON.stringify({ kind: "site", ...input }),
  });
}

export async function getSiteSummary(
  runtimeUrl: string,
  siteId: string,
): Promise<{ crawl: CrawlRow | null; pages: PageSnap[]; diff: CrawlDiff | null }> {
  const body = await runtimeFetch(runtimeUrl, `/api/sites/${encodeURIComponent(siteId)}/summary`);
  return {
    crawl: (body.crawl as CrawlRow | null) ?? null,
    pages: (body.pages as PageSnap[]) ?? [],
    diff: (body.diff as CrawlDiff | null) ?? null,
  };
}

export async function listSiteSummaries(runtimeUrl: string): Promise<RuntimeOverview> {
  const body = await runtimeFetch(runtimeUrl, "/api/sites");
  return {
    sites: (body.sites as CrawlRow[]) ?? [],
    history: (body.history as Record<string, CrawlHistoryPoint[]>) ?? {},
    active: (body.active as CrawlRow | null) ?? null,
  };
}
