import { ChevronLeft, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { Kpi } from "../components/Kpi";
import { ScoreRing } from "../components/ScoreRing";
import { StatusBars } from "../components/StatusBars";
import { getOrg, getSite, type Org, type Site } from "../lib/db";
import { getSiteSummary, listSiteSummaries, resolvedRuntimeUrl, startCrawl, type CrawlRow, type PageSnap } from "../lib/runtime";
import { crawlProgressPercent } from "../lib/score";

export function SitePlaceholderPage() {
  const { t } = useTranslation();
  const { orgId, siteId } = useParams();
  const [org, setOrg] = useState<Org | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [crawl, setCrawl] = useState<CrawlRow | null>(null);
  const [pages, setPages] = useState<PageSnap[]>([]);
  const [busy, setBusy] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runtime = resolvedRuntimeUrl(org?.runtimeBaseUrl);

  const loadSummary = useCallback(async () => {
    if (!siteId || !org) return;
    try {
      const next = await getSiteSummary(runtime, siteId);
      setCrawl(next.crawl);
      setPages(next.pages);
      const overview = await listSiteSummaries(runtime);
      const activeId = overview.active?.site_id ?? null;
      setLockedBy(activeId && activeId !== siteId ? activeId : null);
      setBusy(next.crawl?.status === "running" || activeId === siteId);
    } catch {
      /* runtime still booting */
    }
  }, [org, runtime, siteId]);

  useEffect(() => {
    if (!orgId || !siteId) return;
    void Promise.all([getOrg(orgId), getSite(orgId, siteId)]).then(([nextOrg, nextSite]) => {
      setOrg(nextOrg);
      setSite(nextSite);
    });
  }, [orgId, siteId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => void loadSummary(), 1500);
    return () => window.clearInterval(id);
  }, [busy, loadSummary]);

  async function run() {
    if (!org || !site || !siteId || lockedBy) return;
    setBusy(true);
    setError(null);
    try {
      await startCrawl(runtime, siteId, {
        kind: "site",
        origin: site.origin,
        templateUrls: site.templateUrls,
        rateLimit: org.defaultRateLimit || 4,
        maxPages: Math.min(site.maxPages || 20000, org.maxPagesPerSite || 20000),
        maxDepth: site.maxDepth || 8,
      });
      await loadSummary();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "crawl.alreadyRunning") setError(t("crawl.alreadyRunning"));
      else if (msg === "Failed to fetch" || msg.includes("NetworkError")) setError(t("crawl.needRuntime"));
      else setError(t("crawl.failed"));
      setBusy(false);
    }
  }

  const mix = {
    ok: crawl?.urls_ok ?? 0,
    redirect: crawl?.urls_3xx ?? 0,
    client: crawl?.urls_4xx ?? 0,
    server: crawl?.urls_5xx ?? 0,
  };
  const emptyMix = !crawl || (!crawl.pages_crawled && crawl.status !== "running");
  const running = crawl?.status === "running" || busy;
  const pct = running ? crawlProgressPercent(crawl || { status: "running", pages_crawled: 0 }) : null;
  const found = Math.max(crawl?.discovered || 0, crawl?.sitemap_urls || 0, crawl?.pages_crawled || 0);

  return (
    <div className="page stack">
      <Link to={`/o/${orgId}`} className="muted row" style={{ gap: 6, textDecoration: "none" }}>
        <ChevronLeft size={16} />
        {t("nav.sites")}
      </Link>

      <div className="card audit-hero">
        {running ? (
          <ScoreRing value={pct} mode="progress" label={t("crawl.scan")} size={132} />
        ) : (
          <ScoreRing value={crawl?.status === "done" ? crawl.score : null} label={t("audit.score")} size={132} />
        )}
        <div className="stack">
          <h1 style={{ margin: 0 }}>{site?.name || t("audit.title")}</h1>
          <p className="muted">{site?.origin}</p>
          <p className="muted">
            {lockedBy
              ? t("crawl.alreadyRunning")
              : running
                ? t("crawl.scanning", { have: crawl?.pages_crawled ?? 0, cap: found })
                : crawl
                  ? t("audit.hasData", { pages: crawl.pages_crawled || pages.length })
                  : t("audit.awaitingCrawl")}
          </p>
          <IconBtn
            label={running ? t("crawl.running") : lockedBy ? t("sites.waiting") : t("crawl.scan")}
            tone="accent"
            showLabel
            disabled={running || Boolean(lockedBy) || org?.status === "suspended"}
            onClick={() => void run()}
            icon={<Play size={18} />}
          />
        </div>
      </div>

      {error ? <div className="banner warn">{error}</div> : null}

      <div className="kpi-grid">
        <Kpi tone="ok" label={t("audit.http200")} value={emptyMix ? "—" : mix.ok} />
        <Kpi tone="info" label={t("audit.http3xx")} value={emptyMix ? "—" : mix.redirect} />
        <Kpi tone="warn" label={t("audit.http4xx")} value={emptyMix ? "—" : mix.client} />
        <Kpi tone="danger" label={t("audit.http5xx")} value={emptyMix ? "—" : mix.server} />
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("audit.distribution")}</h2>
        <StatusBars
          mix={emptyMix ? { ok: 0, redirect: 0, client: 0, server: 0 } : mix}
          labels={{
            ok: t("audit.http200"),
            redirect: t("audit.http3xx"),
            client: t("audit.http4xx"),
            server: t("audit.http5xx"),
          }}
        />
      </div>

      <div className="kpi-grid">
        <Kpi tone="danger" label={t("audit.critical")} value={emptyMix ? "—" : (crawl?.issue_critical ?? 0)} />
        <Kpi tone="warn" label={t("audit.warning")} value={emptyMix ? "—" : (crawl?.issue_warn ?? 0)} />
        <Kpi tone="ok" label={t("audit.ok")} value={emptyMix ? "—" : (crawl?.issue_ok ?? 0)} />
        <Kpi tone="info" label={t("audit.sitemap")} value={emptyMix ? "—" : (crawl?.sitemap_urls ?? 0)} />
        <Kpi tone="info" label={t("audit.avgMs")} value={emptyMix ? "—" : (crawl?.avg_ms ?? 0)} />
        <Kpi tone="warn" label={t("audit.dupTitles")} value={emptyMix ? "—" : (crawl?.dup_titles ?? 0)} />
      </div>

      {pages.length > 0 ? (
        <div className="card stack">
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("audit.pages")}</h2>
          <div className="table-wrap">
            <table className="page-table">
              <thead>
                <tr>
                  <th>{t("sites.origin")}</th>
                  <th>{t("audit.http200")}</th>
                  <th>{t("audit.avgMs")}</th>
                  <th>{t("audit.score")}</th>
                  <th>{t("audit.issues")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={`${p.url}-${p.depth}`}>
                    <td>
                      <div className="ellipsis" title={p.url}>
                        {p.url}
                      </div>
                      {p.title ? <div className="muted">{p.title}</div> : null}
                    </td>
                    <td>{p.status || "—"}</td>
                    <td>{p.ms ?? "—"}</td>
                    <td>{p.score}</td>
                    <td>
                      {(p.issues || "")
                        .split(",")
                        .filter(Boolean)
                        .map((code) => (
                          <span key={code} className="issue-tag">
                            {t(`issue.${code}`, { defaultValue: code })}
                          </span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="muted">{t("score.disclaimer")}</p>
    </div>
  );
}
