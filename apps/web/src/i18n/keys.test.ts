import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const es = JSON.parse(readFileSync(join(dir, "es.json"), "utf8")) as Record<string, string>;
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Record<string, string>;

const required = [
  "app.name",
  "login.google",
  "nav.admin",
  "admin.grant",
  "admin.revoke",
  "sites.quota",
  "org.suspended",
  "audit.score",
  "crawl.scan",
  "engine.download",
  "engine.downloading",
];

describe("i18n", () => {
  it("es y en tienen las mismas claves", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("incluye las cadenas de cáscara y admin", () => {
    for (const key of required) {
      expect(es[key], key).toBeTruthy();
      expect(en[key], key).toBeTruthy();
    }
  });
});
