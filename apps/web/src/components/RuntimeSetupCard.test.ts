import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "RuntimeSetupCard.tsx"), "utf8");

describe("RuntimeSetupCard", () => {
  it("Ya está listo es un enlace de protocolo, no descarga el instalador", () => {
    expect(src).toContain("href={preferredStartProtocol()}");
    expect(src).toContain("requestLocalRuntimeStart()");
    expect(src).toContain("copyRuntimeStartCommand");
    expect(src).toContain("RUNTIME_START_COMMAND");
    expect(src).toMatch(/onClick=\{\(\) => void onRetry\(\)\}/);
    const downloadFn = src.indexOf("function download()");
    const retryBtn = src.lastIndexOf("preferredStartProtocol");
    expect(downloadFn).toBeGreaterThan(0);
    expect(retryBtn).toBeGreaterThan(downloadFn);
    const retryBlock = src.slice(src.indexOf("href={preferredStartProtocol()}"));
    expect(retryBlock).not.toMatch(/downloadOrgInstaller|\bdownload\(\)/);
  });
});
