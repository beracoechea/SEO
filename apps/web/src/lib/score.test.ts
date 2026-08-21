import { describe, expect, it } from "vitest";
import { crawlEtaPhrase, crawlEtaSeconds, crawlProgressPercent, httpMixPercents, scoreDelta, scoreTone, trendSteps } from "./score";

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

describe("trendSteps", () => {
  it("marca nodos de mejora, baja o igual", () => {
    const steps = trendSteps([
      { score: 70, at: "2026-08-01" },
      { score: 80, at: "2026-08-02" },
      { score: 80, at: "2026-08-03" },
      { score: 60, at: "2026-08-04" },
    ]);
    expect(steps.map((s) => s.kind)).toEqual(["start", "up", "same", "down"]);
  });

  it("deja 5 nodos, los más recientes", () => {
    const points = Array.from({ length: 8 }, (_, i) => ({ score: 50 + i, at: `2026-08-0${i + 1}` }));
    const steps = trendSteps(points);
    expect(steps).toHaveLength(5);
    expect(steps[0].score).toBe(53);
    expect(steps[4].score).toBe(57);
  });
});

describe("crawlEtaSeconds", () => {
  it("estima con el ritmo del escaneo", () => {
    const started = new Date("2026-08-21T12:00:00Z").getTime();
    const now = started + 10_000;
    expect(
      crawlEtaSeconds(
        { status: "running", pages_crawled: 20, discovered: 100, started_at: "2026-08-21T12:00:00Z" },
        now,
      ),
    ).toBe(40);
    expect(crawlEtaPhrase(40)).toEqual({ key: "crawl.etaSec", n: 40 });
    expect(crawlEtaPhrase(null).key).toBe("crawl.etaCalc");
  });
});
