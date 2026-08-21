import { ArrowLeft, Download, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BackLink } from "../components/BackLink";
import { IconBtn } from "../components/IconBtn";
import { Kpi, KpiHint } from "../components/Kpi";
import { ScoreRing } from "../components/ScoreRing";
import { StatusBars } from "../components/StatusBars";
import { UrlFeed } from "../components/UrlFeed";
import { getOrg, getSite, type Org, type Site } from "../lib/db";
import { filterPages, httpMixFromPages, type PageFilter } from "../lib/pageFilter";
import { getSiteSummary, listSiteSummaries, resolvedRuntimeUrl, startCrawl, type CrawlRow, type PageSnap } from "../lib/runtime";
import { crawlProgressPercent } from "../lib/score";

const HTTP_KPIS: { filter: PageFilter; tone: "ok" | "info" | "warn" | "danger"; label: string; help: string }[] = [
  { filter: "http200", tone: "ok", label: "audit.http200", help: "filter.http200" },
  { filter: "http3xx", tone: "info", label: "audit.http3xx", help: "filter.http3xx" },
  { filter: "http4xx", tone: "warn", label: "audit.http4xx", help: "filter.http4xx" },
  { filter: "http5xx", tone: "danger", label: "audit.http5xx", help: "filter.http5xx" },
];

const FINDING_KPIS: { filter: PageFilter; tone: "ok" | "info" | "warn" | "danger"; label: string; help: string }[] = [
  { filter: "critical", tone: "danger", label: "audit.critical", help: "filter.critical" },
  { filter: "warning", tone: "warn", label: "audit.warning", help: "filter.warning" },
  { filter: "ok", tone: "ok", label: "audit.ok", help: "filter.ok" },
  { filter: "sitemap", tone: "info", label: "audit.sitemap", help: "filter.sitemap" },
  { filter: "slow", tone: "info", label: "audit.avgMs", help: "filter.slow" },
  { filter: "dupTitles", tone: "warn", label: "audit.dupTitles", help: "filter.dupTitles" },
];

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
  const [filter, setFilter] = useState<PageFilter>("all");
  const [hint, setHint] = useState<PageFilter | null>(null);
  const [exporting, setExporting] = useState(false);

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

  function toggleFilter(next: PageFilter) {
    setFilter((prev) => (prev === next ? "all" : next));
    setHint(next);
    document.getElementById("url-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function exportXlsx() {
    if (!pages.length) return;
    setExporting(true);
    setError(null);
    try {
      const { downloadAuditWorkbook } = await import("../lib/exportReport");
      await downloadAuditWorkbook({
        siteName: site?.name || t("audit.title"),
        origin: site?.origin || "",
        crawl,
        pages,
        issueName: (code) => t(`issue.${code}`, { defaultValue: code }),
        copy: {
          summary: t("export.summary"),
          http: t("export.http"),
          findings: t("export.findings"),
          urls: t("export.urls"),
          site: t("sites.name"),
          origin: t("sites.origin"),
          score: t("audit.score"),
          pages: t("audit.pages"),
          sitemap: t("audit.sitemap"),
          avgMs: t("audit.avgMs"),
          metric: t("export.metric"),
          value: t("export.value"),
          http200: t("audit.http200"),
          http3xx: t("audit.http3xx"),
          http4xx: t("audit.http4xx"),
          http5xx: t("audit.http5xx"),
          critical: t("audit.critical"),
          warning: t("audit.warning"),
          ok: t("audit.ok"),
          issue: t("audit.issues"),
          count: t("export.count"),
          url: t("sites.origin"),
          finalUrl: t("audit.landedAt"),
          hops: t("export.hops"),
          redirectStatus: t("export.redirectStatus"),
          status: t("export.status"),
          ms: t("audit.avgMs"),
          title: t("export.titleCol"),
          h1: "H1",
          issues: t("audit.issues"),
          chartHttp: t("audit.distribution"),
          chartFindings: t("audit.issues"),
        },
      });
    } catch {
      setError(t("export.failed"));
    } finally {
      setExporting(false);
    }
  }

  const mix = pages.length ? httpMixFromPages(pages) : { ok: crawl?.urls_ok ?? 0, redirect: crawl?.urls_3xx ?? 0, client: crawl?.urls_4xx ?? 0, server: crawl?.urls_5xx ?? 0 };
  const emptyMix = !crawl || (!crawl.pages_crawled && crawl.status !== "running");
  const running = crawl?.status === "running" || busy;
  const pct = running ? crawlProgressPercent(crawl || { status: "running", pages_crawled: 0 }) : null;
  const found = Math.max(crawl?.discovered || 0, crawl?.sitemap_urls || 0, crawl?.pages_crawled || 0);
  const filtered = useMemo(() => filterPages(pages, filter), [pages, filter]);
  const httpValues: Record<string, number> = {
    http200: mix.ok,
    http3xx: mix.redirect,
    http4xx: mix.client,
    http5xx: mix.server,
  };
  const findingValues: Record<string, number> = {
    critical: crawl?.issue_critical ?? 0,
    warning: crawl?.issue_warn ?? 0,
    ok: crawl?.issue_ok ?? 0,
    sitemap: crawl?.sitemap_urls ?? 0,
    slow: crawl?.avg_ms ?? 0,
    dupTitles: crawl?.dup_titles ?? 0,
  };

  return (
    <div className="page stack">
      <BackLink to={`/o/${orgId}`} label={t("nav.sites")} icon={<ArrowLeft size={20} />} />

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
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <IconBtn
              label={running ? t("crawl.running") : lockedBy ? t("sites.waiting") : t("crawl.scan")}
              tone="accent"
              showLabel
              disabled={running || Boolean(lockedBy) || org?.status === "suspended"}
              onClick={() => void run()}
              icon={<Play size={18} />}
            />
            {pages.length > 0 ? (
              <IconBtn
                label={exporting ? t("export.exporting") : t("export.excel")}
                tone="sky"
                showLabel
                disabled={exporting || running}
                onClick={() => void exportXlsx()}
                icon={<Download size={18} />}
              />
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="banner warn">{error}</div> : null}

      <div className="kpi-grid">
        {HTTP_KPIS.map((item) => (
          <Kpi
            key={item.filter}
            tone={item.tone}
            label={t(item.label)}
            value={emptyMix ? "—" : httpValues[item.filter]}
            active={filter === item.filter}
            onSelect={emptyMix ? undefined : () => toggleFilter(item.filter)}
            onInfo={() => setHint(item.filter)}
            infoLabel={t("audit.whatIsThis")}
          />
        ))}
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
        {FINDING_KPIS.map((item) => (
          <Kpi
            key={item.filter}
            tone={item.tone}
            label={t(item.label)}
            value={emptyMix ? "—" : findingValues[item.filter]}
            active={filter === item.filter}
            onSelect={emptyMix ? undefined : () => toggleFilter(item.filter)}
            onInfo={() => setHint(item.filter)}
            infoLabel={t("audit.whatIsThis")}
          />
        ))}
      </div>

      {hint ? (
        <KpiHint
          title={t(HTTP_KPIS.concat(FINDING_KPIS).find((k) => k.filter === hint)?.label || "audit.pages")}
          body={t(`filter.${hint}`)}
          onClose={() => setHint(null)}
          closeLabel={t("audit.gotIt")}
        />
      ) : null}

      {pages.length > 0 ? (
        <div className="card stack" id="url-feed">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{t("audit.pages")}</h2>
            {filter !== "all" ? (
              <button type="button" className="text-btn" onClick={() => setFilter("all")}>
                {t("audit.clearFilter")}
              </button>
            ) : null}
          </div>
          <p className="muted">
            {filter === "all" ? t("audit.pagesHint") : t(`filter.${filter}`)}
          </p>
          <UrlFeed key={filter} pages={filtered} />
        </div>
      ) : null}

      <p className="muted">{t("score.disclaimer")}</p>
    </div>
  );
}
