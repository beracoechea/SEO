import { describe, expect, it } from "vitest";
import { filterPages, httpMixFromPages, type PageFilter } from "./pageFilter";
import type { PageSnap } from "./runtime";

function page(partial: Partial<PageSnap> & Pick<PageSnap, "url">): PageSnap {
  return {
    status: 200,
    title: "Home",
    h1: "H",
    meta: "m",
    canonical: null,
    score: 100,
    issues: "",
    depth: 0,
    ...partial,
  };
}

describe("filterPages", () => {
  const pages = [
    page({ url: "/ok", status: 200, issues: "" }),
    page({ url: "/gone", status: 404, issues: "http4xx", title: "Gone" }),
    page({ url: "/boom", status: 500, issues: "http5xx", title: "Boom" }),
    page({ url: "/meta", status: 200, issues: "meta", title: "Home" }),
    page({ url: "/slow", status: 200, issues: "slow", ms: 2400, title: "Slow" }),
  ];

  it("separa HTTP y hallazgos", () => {
    expect(filterPages(pages, "http4xx").map((p) => p.url)).toEqual(["/gone"]);
    expect(filterPages(pages, "critical").map((p) => p.url)).toEqual(["/gone", "/boom"]);
    expect(filterPages(pages, "warning").map((p) => p.url)).toEqual(["/meta", "/slow"]);
    expect(filterPages(pages, "dupTitles").map((p) => p.url)).toEqual(["/ok", "/meta"]);
    expect(httpMixFromPages(pages)).toEqual({ ok: 3, redirect: 0, client: 1, server: 1 });
  });

  it("cuenta un 200 con redirect en 3xx, no en páginas OK", () => {
    const redirected = page({
      url: "https://www.example.com/old",
      status: 200,
      hops: 1,
      redirect_status: 301,
      final_url: "https://www.example.com/new",
      issues: "redirect",
      title: "New",
    });
    const direct = page({ url: "https://www.example.com/", status: 200, hops: 0, final_url: "https://www.example.com/" });
    expect(filterPages([redirected, direct], "http3xx").map((p) => p.url)).toEqual(["https://www.example.com/old"]);
    expect(filterPages([redirected, direct], "http200").map((p) => p.url)).toEqual(["https://www.example.com/"]);
  });

  it("all y sitemap no ocultan filas", () => {
    const all: PageFilter = "all";
    expect(filterPages(pages, all)).toHaveLength(pages.length);
    expect(filterPages(pages, "sitemap")).toHaveLength(pages.length);
  });
});
