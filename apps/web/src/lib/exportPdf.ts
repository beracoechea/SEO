import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CrawlRow, PageSnap } from "./runtime";
import { findingCounts, httpMixFromPages, issueCodes } from "./pageFilter";
import { barChartPng, pieChartPng } from "./reportCharts";
import {
  PDF_URL_CAP,
  pickReportPages,
  reportFileStem,
  triggerDownload,
  type ReportCopy,
} from "./exportReport";

type Input = {
  siteName: string;
  origin: string;
  crawl: CrawlRow | null;
  pages: PageSnap[];
  copy: ReportCopy;
  issueName: (code: string) => string;
  title: string;
  dateLabel: string;
  truncatedNote: string;
};

function addPng(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  if (!dataUrl.startsWith("data:image")) return;
  doc.addImage(dataUrl, "PNG", x, y, w, h);
}

export async function downloadAuditPdf(input: Input): Promise<void> {
  const { siteName, origin, crawl, pages, copy, issueName, title, dateLabel, truncatedNote } = input;
  const mix = httpMixFromPages(pages);
  const findings = Object.entries(findingCounts(pages)).sort((a, b) => b[1] - a[1]);
  const picked = pickReportPages(pages);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(dateLabel, margin, 21);
  doc.setTextColor(15, 23, 42);

  autoTable(doc, {
    startY: 36,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 1.6 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 }, 1: { cellWidth: "auto" } },
    body: [
      [copy.site, siteName],
      [copy.origin, origin],
      [copy.score, String(crawl?.score ?? "—")],
      [copy.pages, String(pages.length)],
      [copy.sitemap, String(crawl?.sitemap_urls ?? 0)],
      [copy.avgMs, String(crawl?.avg_ms ?? 0)],
    ],
  });

  const afterMeta = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70;
  autoTable(doc, {
    startY: afterMeta + 6,
    theme: "grid",
    head: [[copy.metric, copy.value]],
    body: [
      [copy.http200, mix.ok],
      [copy.http3xx, mix.redirect],
      [copy.http4xx, mix.client],
      [copy.http5xx, mix.server],
      [copy.critical, crawl?.issue_critical ?? 0],
      [copy.warning, crawl?.issue_warn ?? 0],
      [copy.ok, crawl?.issue_ok ?? 0],
    ],
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8 },
  });

  const afterKpi = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  const pie = pieChartPng(copy.chartHttp, [
    { label: copy.http200, value: mix.ok, color: "#059669" },
    { label: copy.http3xx, value: mix.redirect, color: "#0284c7" },
    { label: copy.http4xx, value: mix.client, color: "#d97706" },
    { label: copy.http5xx, value: mix.server, color: "#e11d48" },
  ]);
  const bars = barChartPng(copy.chartFindings, [
    { label: copy.critical, value: crawl?.issue_critical ?? 0, color: "#e11d48" },
    { label: copy.warning, value: crawl?.issue_warn ?? 0, color: "#d97706" },
    { label: copy.ok, value: crawl?.issue_ok ?? 0, color: "#059669" },
    { label: copy.http3xx, value: mix.redirect, color: "#0284c7" },
  ]);
  const chartY = afterKpi + 6;
  const chartW = (pageW - margin * 2 - 4) / 2;
  const chartH = 52;
  addPng(doc, pie, margin, chartY, chartW, chartH);
  addPng(doc, bars, margin + chartW + 4, chartY, chartW, chartH);

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(copy.findings, margin, 16);
  autoTable(doc, {
    startY: 22,
    theme: "grid",
    head: [[copy.issue, copy.metric, copy.count]],
    body: findings.length
      ? findings.map(([code, count]) => [code, issueName(code), count])
      : [["—", copy.ok, pages.length]],
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 22 } },
  });

  const afterFindings = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(copy.urls, margin, afterFindings + 12);
  if (pages.length > PDF_URL_CAP) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(truncatedNote, margin, afterFindings + 18, { maxWidth: pageW - margin * 2 });
    doc.setTextColor(15, 23, 42);
  }
  autoTable(doc, {
    startY: afterFindings + (pages.length > PDF_URL_CAP ? 24 : 16),
    theme: "grid",
    head: [[copy.url, copy.status, copy.title, copy.issues]],
    body: picked.map((page) => [
      page.url,
      String(page.status || ""),
      (page.title || "").slice(0, 80),
      issueCodes(page)
        .map((code) => issueName(code))
        .join("; "),
    ]),
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 16 },
      2: { cellWidth: 40 },
      3: { cellWidth: "auto" },
    },
  });

  const blob = doc.output("blob");
  triggerDownload(blob, `${reportFileStem(siteName)}.pdf`);
}
