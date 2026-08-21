import { describe, expect, it } from "vitest";
import type { PageSnap } from "./runtime";
import { pickReportPages } from "./exportReport";

function page(partial: Partial<PageSnap> & { url: string }): PageSnap {
  return {
    status: 200,
    title: null,
    h1: null,
    meta: null,
    canonical: null,
    score: 80,
    issues: "",
    depth: 1,
    ...partial,
  };
}

describe("pickReportPages", () => {
  it("prioriza 4xx/5xx y recorta al tope", () => {
    const pages = [
      page({ url: "https://ex.com/ok", issues: "" }),
      page({ url: "https://ex.com/slow", issues: "title", ms: 900 }),
      page({ url: "https://ex.com/missing", status: 404, issues: "http4xx" }),
      page({ url: "https://ex.com/down", status: 500, issues: "http5xx" }),
    ];
    const picked = pickReportPages(pages, 3);
    expect(picked.map((p) => p.url)).toEqual([
      "https://ex.com/missing",
      "https://ex.com/down",
      "https://ex.com/slow",
    ]);
  });
});
