import { Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { ScanQueue } from "../components/ScanQueue";
import { ScoreRing } from "../components/ScoreRing";
import { TrendNodes } from "../components/TrendNodes";
import { deleteSite, getOrg, listSites, type Org, type Site } from "../lib/db";
import { AlertSettings } from "../components/AlertSettings";
import { isFirestoreNetworkError } from "../lib/firebase";
import {
  listSiteSummaries,
  resolvedRuntimeUrl,
  saveRuntimeAlerts,
  startCrawl,
  syncSchedule,
  cancelQueued,
  reorderQueue,
  runQueuedNow,
  type CrawlHistoryPoint,
  type CrawlRow,
  type QueueItem,
} from "../lib/runtime";
import { crawlEtaPhrase, crawlEtaSeconds, crawlProgressPercent } from "../lib/score";

function until(iso: string | null | undefined, t: (k: string, opts?: Record<string, unknown>) => string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return t("sites.agoNow");
  const min = Math.round(ms / 60000);
  if (min < 60) return t("sites.inMin", { n: Math.max(1, min) });
  const h = Math.round(min / 60);
  if (h < 48) return t("sites.inHour", { n: h });
  return t("sites.inDay", { n: Math.max(1, Math.round(h / 24)) });
}

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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [schedules, setSchedules] = useState<Record<string, { interval: string; next_run_at: string | null }>>({});
  const [alertWebhook, setAlertWebhook] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const runtime = resolvedRuntimeUrl(org?.runtimeBaseUrl);

  const refreshScores = useCallback(async () => {
    try {
      const overview = await listSiteSummaries(runtime);
      const map: Record<string, CrawlRow> = {};
      for (const row of overview.sites) map[row.site_id] = row;
      setScores(map);
      setHistory(overview.history);
      setScanning(overview.active?.site_id ?? null);
      setQueue(overview.queue || []);
      setSchedules(overview.schedules || {});
      setAlertWebhook(overview.alerts.webhook);
      setAlertEmail(overview.alerts.email);
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
      .catch((e) => setError(isFirestoreNetworkError(e) ? t("errors.firestoreNetwork") : t("errors.generic")));
  }, [orgId, t]);

  useEffect(() => {
    if (!org) return;
    void refreshScores();
  }, [org, refreshScores]);

  useEffect(() => {
    if (!org) return;
    void syncSchedule(
      runtime,
      sites.map((s) => ({
        id: s.id,
        origin: s.origin,
        templateUrls: s.templateUrls,
        maxPages: Math.min(s.maxPages || 20000, org.maxPagesPerSite || 20000),
        maxDepth: s.maxDepth || 8,
        scanEvery: s.scanEvery || "off",
        renderJs: s.renderJs || "auto",
      })),
      org.defaultRateLimit || 10,
    )
      .then(() => refreshScores())
      .catch(() => {
        /* runtime still booting */
      });
  }, [org, runtime, sites, refreshScores]);

  useEffect(() => {
    const scheduled = sites.some((s) => s.scanEvery && s.scanEvery !== "off");
    if (!scanning && queue.length === 0 && !scheduled) return;
    const ms = scanning || queue.length ? 1200 : 15000;
    const id = window.setInterval(() => void refreshScores(), ms);
    return () => window.clearInterval(id);
  }, [scanning, queue.length, sites, refreshScores]);

  async function scan(site: Site, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!org || org.status === "suspended") return;
    if (scanning === site.id) return;
    if (queue.some((q) => q.site_id === site.id)) return;
    setError(null);
    try {
      await startCrawl(runtime, site.id, {
        kind: "site",
        origin: site.origin,
        templateUrls: site.templateUrls,
        rateLimit: org.defaultRateLimit || 10,
        maxPages: Math.min(site.maxPages || 20000, org.maxPagesPerSite || 20000),
        maxDepth: site.maxDepth || 8,
        scanEvery: site.scanEvery,
        renderJs: site.renderJs,
      });
      await refreshScores();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "crawl.alreadyRunning") await refreshScores();
      else if (msg === "Failed to fetch" || msg.includes("NetworkError")) setError(t("crawl.needRuntime"));
      else setError(t("crawl.failed"));
    }
  }

  async function saveAlerts(next: { webhook: string; email: string }) {
    setError(null);
    try {
      await saveRuntimeAlerts(runtime, next);
      setAlertWebhook(next.webhook);
      setAlertEmail(next.email);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) setError(t("crawl.needRuntime"));
      else setError(t("errors.generic"));
    }
  }

  async function remove(site: Site, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!orgId || org?.status === "suspended" || scanning === site.id) return;
    if (confirmDelete !== site.id) {
      setConfirmDelete(site.id);
      return;
    }
    setError(null);
    try {
      await deleteSite(orgId, site.id);
      setSites((list) => list.filter((s) => s.id !== site.id));
      setConfirmDelete(null);
    } catch (e) {
      if (e instanceof Error && e.message === "org-suspended") setError(t("org.suspended"));
      else if (isFirestoreNetworkError(e)) setError(t("errors.firestoreNetwork"));
      else setError(t("errors.generic"));
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
            {queue.length ? <span className="muted">{t("crawl.queueMore", { n: queue.length })}</span> : null}
          </div>
        </div>
      ) : null}

      {scanningSite || queue.length ? (
        <ScanQueue
          runningName={scanningSite?.name}
          items={queue}
          sites={sites}
          disabled={org?.status === "suspended"}
          onMove={(ids) => reorderQueue(runtime, ids).then(() => refreshScores()).catch(() => setError(t("crawl.failed")))}
          onCancel={(id) =>
            cancelQueued(runtime, id)
              .then(() => refreshScores())
              .catch(() => {
                setError(t("crawl.failed"));
                throw new Error("queue.cancel");
              })
          }
          onRunNow={(id) => runQueuedNow(runtime, id).then(() => refreshScores()).catch(() => setError(t("crawl.failed")))}
        />
      ) : null}

      {error ? <div className="banner warn">{error}</div> : null}
      {org ? (
        <AlertSettings webhook={alertWebhook} email={alertEmail} onSave={saveAlerts} />
      ) : null}
      {sites.length === 0 ? (
        <div className="card muted">{t("sites.empty")}</div>
      ) : (
        <div className="site-grid">
          {sites.map((s) => {
            const row = scores[s.id];
            const series = [...(history[s.id] || [])].reverse();
            const busyThis = scanning === s.id || row?.status === "running";
            const queuedThis = queue.some((q) => q.site_id === s.id);
            const cadence = schedules[s.id]?.interval || s.scanEvery || "off";
            const nextAt = schedules[s.id]?.next_run_at;
            const pct = busyThis ? crawlProgressPercent(row || { status: "running", pages_crawled: 0 }) : null;
            const cadenceKey =
              cadence === "day"
                ? "sites.scanDay"
                : cadence === "3days"
                  ? "sites.scan3days"
                  : cadence === "week"
                    ? "sites.scanWeek"
                    : cadence === "month"
                      ? "sites.scanMonth"
                      : "sites.scanOff";
            return (
              <div key={s.id} className={`site-card${busyThis ? " is-scanning" : ""}${queuedThis ? " is-waiting" : ""}`}>
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
                      <span>
                        {row?.status === "done"
                          ? t("sites.pagesShort", { n: row.pages_crawled || 0 })
                          : row?.status === "failed" && row.pages_crawled
                            ? t("crawl.incompleteShort", { n: row.pages_crawled })
                            : t("sites.never")}
                      </span>
                      {row?.finished_at ? <span>· {ago(row.finished_at, t)}</span> : null}
                      {cadence !== "off" ? (
                        <span>
                          · {t(cadenceKey)}
                          {nextAt ? ` · ${t("sites.scanNext", { when: until(nextAt, t) })}` : null}
                        </span>
                      ) : null}
                      {queuedThis ? <span> · {t("sites.queued")}</span> : null}
                    </div>
                  )}
                  {!busyThis ? (
                    <TrendNodes points={series.map((p) => ({ score: p.score, at: p.finished_at }))} />
                  ) : null}
                </Link>
                <div className="site-card-actions">
                  {confirmDelete === s.id && !busyThis ? (
                    <>
                      <IconBtn
                        className="site-scan-btn"
                        label={t("sites.deleteYes")}
                        tone="danger"
                        showLabel
                        disabled={org?.status === "suspended"}
                        onClick={(e) => void remove(s, e)}
                        icon={<Trash2 size={18} />}
                      />
                      <IconBtn label={t("sites.deleteNo")} onClick={() => setConfirmDelete(null)} icon={<X size={18} />} />
                    </>
                  ) : (
                    <>
                      <IconBtn
                        className="site-scan-btn"
                        label={busyThis ? t("crawl.running") : queuedThis ? t("sites.queued") : t("crawl.scan")}
                        tone="accent"
                        showLabel
                        disabled={busyThis || queuedThis || org?.status === "suspended"}
                        onClick={(e) => void scan(s, e)}
                        icon={<Play size={18} />}
                      />
                      <IconBtn
                        to={`/o/${orgId}/s/${s.id}/edit`}
                        label={busyThis ? t("sites.lockedWhileScanning") : t("sites.edit")}
                        disabled={busyThis || org?.status === "suspended"}
                        icon={<Pencil size={18} />}
                      />
                      <IconBtn
                        label={busyThis ? t("sites.lockedWhileScanning") : t("sites.delete")}
                        tone="danger"
                        disabled={busyThis || org?.status === "suspended"}
                        onClick={(e) => void remove(s, e)}
                        icon={<Trash2 size={18} />}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
