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
