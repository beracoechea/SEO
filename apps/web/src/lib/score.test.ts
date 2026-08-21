import { describe, expect, it } from "vitest";
import { crawlProgressPercent, httpMixPercents, scoreDelta, scoreTone } from "./score";

describe("scoreTone", () => {
  it("usa estados esmeralda / ámbar / carmesí", () => {
    expect(scoreTone(92)).toBe("ok");
    expect(scoreTone(61)).toBe("warn");
    expect(scoreTone(20)).toBe("danger");
    expect(scoreTone(null)).toBe("pending");
  });
});

describe("httpMixPercents", () => {
  it("devuelve ceros sin crawls", () => {
    expect(httpMixPercents({ ok: 0, redirect: 0, client: 0, server: 0 })).toEqual({
      ok: 0,
      redirect: 0,
      client: 0,
      server: 0,
    });
  });

  it("normaliza a 100", () => {
    const p = httpMixPercents({ ok: 80, redirect: 10, client: 10, server: 0 });
    expect(p.ok).toBe(80);
    expect(p.redirect).toBe(10);
  });
});

describe("crawlProgressPercent", () => {
  it("llena la burbuja según URLs descubiertas", () => {
    expect(crawlProgressPercent({ status: "running", pages_crawled: 50, discovered: 200 })).toBe(25);
    expect(crawlProgressPercent({ status: "done", pages_crawled: 50, discovered: 50 })).toBe(100);
  });
});

describe("scoreDelta", () => {
  it("marca avance o retroceso entre crawls", () => {
    expect(scoreDelta(80, 70)).toBe(10);
    expect(scoreDelta(60, 72)).toBe(-12);
    expect(scoreDelta(80, null)).toBeNull();
  });
});
