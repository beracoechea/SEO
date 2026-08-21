import { Play, Plus } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { ScoreRing } from "../components/ScoreRing";
import { TrendNodes } from "../components/TrendNodes";
import { getOrg, listSites, type Org, type Site } from "../lib/db";
import {
  listSiteSummaries,
  resolvedRuntimeUrl,
  startCrawl,
  type CrawlHistoryPoint,
  type CrawlRow,
} from "../lib/runtime";
import { crawlEtaPhrase, crawlEtaSeconds, crawlProgressPercent } from "../lib/score";

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
  const scanningSite = sites.find((s) => s.id === scanning);
  const scanningRow = scanning ? scores[scanning] : undefined;
  const scanPct = scanning
    ? crawlProgressPercent(scanningRow || { status: "running", pages_crawled: 0 })
    : 0;
  const eta = crawlEtaPhrase(scanningRow ? crawlEtaSeconds(scanningRow) : null);

  return (
    <div className="page stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h1 style={{ margin: 0 }}>{t("nav.sites")}</h1>
        {org ? (
          <div className={`quota-bubble${atQuota ? " is-full" : ""}`} title={t("sites.quotaReached")}>
            <strong>
              {sites.length}/{org.maxSites}
            </strong>
            <span>{t("sites.quotaShort")}</span>
          </div>
        ) : null}
      </div>

      {scanningSite ? (
        <div className="scan-water" aria-live="polite">
          <div className="scan-water-fill" style={{ height: `${Math.max(22, scanPct)}%` }}>
            <span className="scan-water-wave" />
            <span className="scan-water-wave is-slow" />
          </div>
          <div className="scan-water-copy">
            <strong>{t("crawl.running")}</strong>
            <span>
              {scanningSite.name} ·{" "}
              {t("crawl.scanning", {
                have: scanningRow?.pages_crawled ?? 0,
                cap: Math.max(scanningRow?.discovered || 0, scanningRow?.sitemap_urls || 0, scanningRow?.pages_crawled || 0),
              })}
            </span>
            <span className="scan-water-eta">{t(eta.key, { n: eta.n })}</span>
          </div>
        </div>
      ) : null}

      {error ? <div className="banner warn">{error}</div> : null}
      {sites.length === 0 ? (
        <div className="card muted">{t("sites.empty")}</div>
      ) : (
        <div className="site-grid">
          {sites.map((s) => {
            const row = scores[s.id];
            const series = [...(history[s.id] || [])].reverse();
            const busyThis = scanning === s.id || row?.status === "running";
            const waiting = Boolean(scanning && scanning !== s.id);
            const pct = busyThis ? crawlProgressPercent(row || { status: "running", pages_crawled: 0 }) : null;
            return (
              <div key={s.id} className={`site-card${busyThis ? " is-scanning" : ""}${waiting ? " is-waiting" : ""}`}>
                <Link to={`/o/${orgId}/s/${s.id}`} className="site-card-main">
                  <div className="site-card-head">
                    {busyThis ? (
                      <ScoreRing value={pct} mode="progress" size={72} label={t("crawl.running")} />
                    ) : (
                      <ScoreRing value={row?.status === "done" ? row.score : null} size={72} label={t("audit.score")} />
                    )}
                    <div className="site-card-copy">
                      <strong>{s.name}</strong>
                      <div className="muted ellipsis">{s.origin}</div>
                    </div>
                  </div>
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
                    </div>
                  )}
                  {waiting ? <div className="muted">{t("sites.waiting")}</div> : null}
                  {!busyThis ? (
                    <TrendNodes points={series.map((p) => ({ score: p.score, at: p.finished_at }))} />
                  ) : null}
                </Link>
                <div className="site-card-actions">
                  <IconBtn
                    label={busyThis ? t("crawl.running") : waiting ? t("sites.waiting") : t("crawl.scan")}
                    tone="accent"
                    showLabel
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
