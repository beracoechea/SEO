import ExcelJS from "exceljs";
import type { CrawlRow, PageSnap } from "./runtime";
import { findingCounts, httpMixFromPages, issueCodes, pageHadRedirect, pageHttpClass } from "./pageFilter";
import { barChartPng, pieChartPng } from "./reportCharts";

export type ReportCopy = {
  summary: string;
  http: string;
  findings: string;
  urls: string;
  site: string;
  origin: string;
  score: string;
  pages: string;
  sitemap: string;
  avgMs: string;
  metric: string;
  value: string;
  http200: string;
  http3xx: string;
  http4xx: string;
  http5xx: string;
  critical: string;
  warning: string;
  ok: string;
  issue: string;
  count: string;
  url: string;
  finalUrl: string;
  hops: string;
  redirectStatus: string;
  status: string;
  ms: string;
  title: string;
  h1: string;
  issues: string;
  chartHttp: string;
  chartFindings: string;
};

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function addImage(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, dataUrl: string, col: number, row: number) {
  if (!dataUrl) return;
  const id = workbook.addImage({ base64: dataUrlToBase64(dataUrl), extension: "png" });
  sheet.addImage(id, { tl: { col, row }, ext: { width: 480, height: 280 } });
}

function styleHead(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  row.alignment = { vertical: "middle", wrapText: true };
}

export async function downloadAuditWorkbook(input: {
  siteName: string;
  origin: string;
  crawl: CrawlRow | null;
  pages: PageSnap[];
  copy: ReportCopy;
  issueName: (code: string) => string;
}): Promise<void> {
  const { siteName, origin, crawl, pages, copy, issueName } = input;
  const mix = httpMixFromPages(pages);
  const findings = findingCounts(pages);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Technical SEO Monitor";
  workbook.created = new Date();

  const summary = workbook.addWorksheet(copy.summary, { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }];
  summary.addRow([copy.site, siteName]);
  summary.addRow([copy.origin, origin]);
  summary.addRow([copy.score, crawl?.score ?? ""]);
  summary.addRow([copy.pages, pages.length]);
  summary.addRow([copy.sitemap, crawl?.sitemap_urls ?? 0]);
  summary.addRow([copy.avgMs, crawl?.avg_ms ?? 0]);
  summary.addRow([]);
  const kpiHead = summary.addRow([copy.metric, copy.value]);
  styleHead(kpiHead);
  summary.addRow([copy.http200, mix.ok]);
  summary.addRow([copy.http3xx, mix.redirect]);
  summary.addRow([copy.http4xx, mix.client]);
  summary.addRow([copy.http5xx, mix.server]);
  summary.addRow([copy.critical, crawl?.issue_critical ?? pages.filter((p) => issueCodes(p).includes("http4xx") || issueCodes(p).includes("http5xx")).length]);
  summary.addRow([copy.warning, crawl?.issue_warn ?? 0]);
  summary.addRow([copy.ok, crawl?.issue_ok ?? 0]);

  addImage(
    workbook,
    summary,
    pieChartPng(copy.chartHttp, [
      { label: copy.http200, value: mix.ok, color: "#059669" },
      { label: copy.http3xx, value: mix.redirect, color: "#0284c7" },
      { label: copy.http4xx, value: mix.client, color: "#d97706" },
      { label: copy.http5xx, value: mix.server, color: "#e11d48" },
    ]),
    0,
    16,
  );
  addImage(
    workbook,
    summary,
    barChartPng(copy.chartFindings, [
      { label: copy.critical, value: crawl?.issue_critical ?? 0, color: "#e11d48" },
      { label: copy.warning, value: crawl?.issue_warn ?? 0, color: "#d97706" },
      { label: copy.ok, value: crawl?.issue_ok ?? 0, color: "#059669" },
      { label: copy.http3xx, value: mix.redirect, color: "#0284c7" },
    ]),
    8,
    16,
  );

  const http = workbook.addWorksheet(copy.http);
  http.columns = [{ width: 28 }, { width: 14 }, { width: 12 }];
  const httpHead = http.addRow([copy.metric, copy.count, "%"]);
  styleHead(httpHead);
  const httpTotal = Math.max(1, mix.ok + mix.redirect + mix.client + mix.server);
  (
    [
      [copy.http200, mix.ok],
      [copy.http3xx, mix.redirect],
      [copy.http4xx, mix.client],
      [copy.http5xx, mix.server],
    ] as [string, number][]
  ).forEach(([label, value]) => {
    http.addRow([label, value, Math.round((value / httpTotal) * 100)]);
  });
  http.autoFilter = { from: "A1", to: "C1" };

  const findingSheet = workbook.addWorksheet(copy.findings);
  findingSheet.columns = [{ width: 22 }, { width: 36 }, { width: 12 }];
  const findHead = findingSheet.addRow([copy.issue, copy.metric, copy.count]);
  styleHead(findHead);
  Object.entries(findings)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => {
      findingSheet.addRow([code, issueName(code), count]);
    });
  if (!Object.keys(findings).length) findingSheet.addRow(["—", copy.ok, pages.length]);
  findingSheet.autoFilter = { from: "A1", to: "C1" };

  const urls = workbook.addWorksheet(copy.urls);
  urls.columns = [
    { width: 48 },
    { width: 48 },
    { width: 10 },
    { width: 14 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 36 },
    { width: 28 },
    { width: 28 },
    { width: 14 },
  ];
  const urlHead = urls.addRow([
    copy.url,
    copy.finalUrl,
    copy.hops,
    copy.redirectStatus,
    copy.status,
    copy.ms,
    copy.score,
    copy.title,
    copy.h1,
    copy.issues,
    copy.http,
  ]);
  styleHead(urlHead);
  pages.forEach((page) => {
    urls.addRow([
      page.url,
      page.final_url || page.url,
      page.hops ?? (pageHadRedirect(page) ? 1 : 0),
      page.redirect_status || "",
      page.status,
      page.ms ?? "",
      page.score,
      page.title || "",
      page.h1 || "",
      issueCodes(page)
        .map((code) => issueName(code))
        .join("; "),
      pageHttpClass(page),
    ]);
  });
  urls.autoFilter = { from: "A1", to: "K1" };
  urls.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (siteName || "sitio").replace(/[^\w.-]+/g, "_").slice(0, 40);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `seo-${safe}-${stamp}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
