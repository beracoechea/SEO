export type ScoreTone = "ok" | "warn" | "danger" | "pending";

export function scoreTone(value: number | null | undefined): ScoreTone {
  if (value == null || Number.isNaN(value)) return "pending";
  if (value >= 80) return "ok";
  if (value >= 50) return "warn";
  return "danger";
}

export type HttpMix = {
  ok: number;
  redirect: number;
  client: number;
  server: number;
};

export function crawlProgressPercent(row: {
  status?: string;
  pages_crawled?: number;
  discovered?: number;
  sitemap_urls?: number;
}): number {
  if (row.status === "done") return 100;
  const crawled = Math.max(0, row.pages_crawled ?? 0);
  const total = Math.max(crawled, row.discovered ?? 0, row.sitemap_urls ?? 0, 1);
  if (crawled <= 0) return 1;
  return Math.min(99, Math.round((crawled / total) * 100));
}

export function scoreDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || Number.isNaN(current) || Number.isNaN(previous)) return null;
  return Math.round(current) - Math.round(previous);
}

export type TrendKind = "start" | "up" | "down" | "same";

export type TrendPoint = {
  score: number | null;
  at: string | null;
};

export type TrendStep = {
  kind: TrendKind;
  score: number;
  at: string | null;
  delta: number | null;
};

export function crawlEtaSeconds(
  row: {
    status?: string;
    pages_crawled?: number;
    discovered?: number;
    sitemap_urls?: number;
    avg_ms?: number;
    started_at?: string;
  },
  now = Date.now(),
): number | null {
  if (row.status === "done") return 0;
  const crawled = Math.max(0, row.pages_crawled ?? 0);
  const total = Math.max(crawled, row.discovered ?? 0, row.sitemap_urls ?? 0);
  const remaining = Math.max(0, total - crawled);
  if (remaining <= 0 || crawled <= 0) return null;
  const started = row.started_at ? new Date(row.started_at).getTime() : NaN;
  if (!Number.isNaN(started) && now - started >= 2500) {
    return Math.max(5, Math.round(((now - started) / crawled) * remaining / 1000));
  }
  const perMs = Math.max(row.avg_ms || 0, 250) + 250;
  return Math.max(5, Math.round((remaining * perMs) / 1000));
}

export function crawlEtaPhrase(seconds: number | null): { key: "crawl.etaCalc" | "crawl.etaSec" | "crawl.etaMin" | "crawl.etaHour"; n?: number } {
  if (seconds == null) return { key: "crawl.etaCalc" };
  if (seconds < 90) return { key: "crawl.etaSec", n: Math.max(5, seconds) };
  if (seconds < 3600) return { key: "crawl.etaMin", n: Math.max(1, Math.round(seconds / 60)) };
  return { key: "crawl.etaHour", n: Math.max(1, Math.round(seconds / 3600)) };
}

export function trendSteps(points: TrendPoint[], limit = 5): TrendStep[] {
  const scored = points.filter((p): p is TrendPoint & { score: number } => p.score != null && !Number.isNaN(p.score));
  const slice = scored.slice(-limit);
  return slice.map((p, i) => {
    if (i === 0) {
      return { kind: "start", score: p.score, at: p.at, delta: null };
    }
    const delta = Math.round(p.score) - Math.round(slice[i - 1].score);
    const kind: TrendKind = delta > 0 ? "up" : delta < 0 ? "down" : "same";
    return { kind, score: p.score, at: p.at, delta };
  });
}

export function httpMixPercents(mix: HttpMix): HttpMix {
  const total = mix.ok + mix.redirect + mix.client + mix.server;
  if (total <= 0) {
    return { ok: 0, redirect: 0, client: 0, server: 0 };
  }
  return {
    ok: Math.round((mix.ok / total) * 100),
    redirect: Math.round((mix.redirect / total) * 100),
    client: Math.round((mix.client / total) * 100),
    server: Math.round((mix.server / total) * 100),
  };
}
