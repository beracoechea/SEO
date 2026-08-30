import { describe, expect, it } from "vitest";
import {
  LEGACY_START_PROTOCOL,
  RUNTIME_START_COMMAND,
  RUNTIME_START_PROTOCOL,
  copyRuntimeStartCommand,
  preferredStartProtocol,
  requestLocalRuntimeStart,
  startProtocolUrls,
} from "./runtimeLaunch";

describe("runtimeLaunch", () => {
  it("prioriza el protocolo de instalaciones anteriores (un gesto, un scheme)", () => {
    expect(RUNTIME_START_PROTOCOL).toBe("seo-monitor://start");
    expect(LEGACY_START_PROTOCOL).toBe("logicbus-seo://start");
    expect(startProtocolUrls()).toEqual(["logicbus-seo://start", "seo-monitor://start"]);
    expect(preferredStartProtocol()).toBe(LEGACY_START_PROTOCOL);
  });

  it("asigna un solo location.href en el gesto de clic, sin iframe ni descarga", () => {
    const seen: string[] = [];
    const loc = {
      set href(url: string) {
        seen.push(url);
      },
      get href() {
        return seen[seen.length - 1] || "";
      },
    };
    requestLocalRuntimeStart(loc);
    expect(seen).toEqual([LEGACY_START_PROTOCOL]);
    expect(requestLocalRuntimeStart.toString()).not.toMatch(/download/i);
  });

  it("el comando de arranque apunta a arrancar.cmd, no a actualizar.ps1", () => {
    expect(RUNTIME_START_COMMAND).toContain("C:\\seo-runtime\\arrancar.cmd");
    expect(RUNTIME_START_COMMAND).not.toContain("actualizar.ps1");
    expect(RUNTIME_START_COMMAND).not.toContain("powershell.exe");
  });

  it("copia el comando de arranque al portapapeles", async () => {
    let written = "";
    const ok = await copyRuntimeStartCommand({
      writeText: async (text) => {
        written = text;
      },
    });
    expect(ok).toBe(true);
    expect(written).toBe(RUNTIME_START_COMMAND);
  });
});
