import { Play, Plus } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { ScoreRing } from "../components/ScoreRing";
import { Sparkline } from "../components/Sparkline";
import { getOrg, listSites, type Org, type Site } from "../lib/db";
import {
  listSiteSummaries,
  resolvedRuntimeUrl,
  startCrawl,
  type CrawlHistoryPoint,
  type CrawlRow,
} from "../lib/runtime";
import { crawlProgressPercent, scoreDelta } from "../lib/score";

function ago(iso: string | null | undefined, t: (k: string, opts?: Record<string, unknown>) => string): string {
  if (!iso) return t("sites.never");
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return t("sites.never");
  const min = Math.round(ms / 60000);
  if (min < 1) return t("sites.agoNow");
  if (min < 60) return t("sites.agoMin", { n: min });
  const h = Math.round(min / 60);
  if (h < 48) return t("sites.agoHour", { n: h });
  return t("sites.agoDay", { n: Math.round(h / 24) });
}

export function OrgHomePage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [scores, setScores] = useState<Record<string, CrawlRow>>({});
  const [history, setHistory] = useState<Record<string, CrawlHistoryPoint[]>>({});
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runtime = resolvedRuntimeUrl(org?.runtimeBaseUrl);

  const refreshScores = useCallback(async () => {
    try {
      const overview = await listSiteSummaries(runtime);
      const map: Record<string, CrawlRow> = {};
      for (const row of overview.sites) map[row.site_id] = row;
      setScores(map);
      setHistory(overview.history);
      setScanning(overview.active?.site_id ?? null);
    } catch {
      setScores({});
    }
  }, [runtime]);

  useEffect(() => {
    if (!orgId) return;
    void Promise.all([listSites(orgId), getOrg(orgId)])
      .then(([list, nextOrg]) => {
        setSites(list);
        setOrg(nextOrg);
      })
      .catch(() => setError(t("errors.generic")));
  }, [orgId, t]);

  useEffect(() => {
    if (!org) return;
    void refreshScores();
  }, [org, refreshScores]);

  useEffect(() => {
    if (!scanning) return;
    const id = window.setInterval(() => void refreshScores(), 1200);
    return () => window.clearInterval(id);
  }, [scanning, refreshScores]);

  async function scan(site: Site, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!org || org.status === "suspended" || scanning) return;
    setError(null);
    setScanning(site.id);
    try {
      await startCrawl(runtime, site.id, {
        kind: "site",
        origin: site.origin,
        templateUrls: site.templateUrls,
        rateLimit: org.defaultRateLimit || 4,
        maxPages: Math.min(site.maxPages || 20000, org.maxPagesPerSite || 20000),
        maxDepth: site.maxDepth || 8,
      });
      await refreshScores();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "crawl.alreadyRunning") setError(t("crawl.alreadyRunning"));
      else if (msg === "Failed to fetch" || msg.includes("NetworkError")) setError(t("crawl.needRuntime"));
      else setError(t("crawl.failed"));
      setScanning(null);
    }
  }

  const atQuota = org ? sites.length >= org.maxSites : false;
  const canAdd = org?.status === "active" && !atQuota;
  const scanningName = sites.find((s) => s.id === scanning)?.name;

  return (
    <div className="page stack">
      <h1 style={{ margin: 0 }}>{t("nav.sites")}</h1>
      {org ? (
        <p className="muted">
          {t("sites.quota", { have: sites.length, allowed: org.maxSites, pages: org.maxPagesPerSite.toLocaleString() })}
        </p>
      ) : null}
      {scanningName ? <div className="banner ok">{t("crawl.busyOther", { name: scanningName })}</div> : null}
      {atQuota ? <div className="banner warn">{t("sites.quotaReached")}</div> : null}
      {error ? <div className="banner warn">{error}</div> : null}
      {sites.length === 0 ? (
        <div className="card muted">{t("sites.empty")}</div>
      ) : (
        <div className="stack">
          {sites.map((s) => {
            const row = scores[s.id];
            const series = [...(history[s.id] || [])].reverse();
            const prev = series.length >= 2 ? series[series.length - 2] : undefined;
            const delta = row?.status === "done" ? scoreDelta(row.score, prev?.score) : null;
            const busyThis = scanning === s.id || row?.status === "running";
            const waiting = Boolean(scanning && scanning !== s.id);
            const pct = busyThis ? crawlProgressPercent(row || { status: "running", pages_crawled: 0 }) : null;
            return (
              <div key={s.id} className={`site-card${busyThis ? " is-scanning" : ""}${waiting ? " is-waiting" : ""}`}>
                {busyThis ? (
                  <ScoreRing value={pct} mode="progress" size={84} label={t("crawl.scan")} />
                ) : (
                  <ScoreRing value={row?.status === "done" ? row.score : null} size={84} label={t("audit.score")} />
                )}
                <Link to={`/o/${orgId}/s/${s.id}`} className="site-card-main">
                  <strong>{s.name}</strong>
                  <div className="muted ellipsis">{s.origin}</div>
                  {busyThis ? (
                    <div className="site-card-meta">
                      {t("crawl.scanning", {
                        have: row?.pages_crawled ?? 0,
                        cap: Math.max(row?.discovered || 0, row?.sitemap_urls || 0, row?.pages_crawled || 0),
                      })}
                    </div>
                  ) : (
                    <div className="site-card-meta">
                      <span>{row?.status === "done" ? t("sites.pagesShort", { n: row.pages_crawled || 0 }) : t("sites.never")}</span>
                      {row?.finished_at ? <span>· {ago(row.finished_at, t)}</span> : null}
                      {delta != null ? (
                        <span className={delta >= 0 ? "delta-up" : "delta-down"}>
                          {delta >= 0 ? `↑ +${delta}` : `↓ ${delta}`}
                        </span>
                      ) : null}
                    </div>
                  )}
                  {waiting ? <div className="muted">{t("sites.waiting")}</div> : null}
                  <Sparkline values={series.map((p) => p.score ?? 0).filter((n) => n > 0)} />
                </Link>
                <div className="site-card-actions">
                  <IconBtn
                    label={busyThis ? t("crawl.running") : waiting ? t("sites.waiting") : t("crawl.scan")}
                    tone="accent"
                    disabled={busyThis || waiting || org?.status === "suspended"}
                    onClick={(e) => void scan(s, e)}
                    icon={<Play size={18} />}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted">{t("sites.httpScoreHint")}</p>
      {canAdd ? (
        <IconBtn
          className="fab"
          to={`/o/${orgId}/sites/new`}
          label={t("sites.add")}
          tone="accent"
          icon={<Plus size={28} />}
        />
      ) : null}
    </div>
  );
}
