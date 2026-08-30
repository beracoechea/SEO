import { describe, expect, it, vi } from "vitest";
import { RUNTIME_START_PROTOCOL, requestLocalRuntimeStart } from "./runtimeLaunch";

describe("runtimeLaunch", () => {
  it("usa el protocolo que registra el instalador", () => {
    expect(RUNTIME_START_PROTOCOL).toBe("seo-monitor://start");
  });

  it("pide a Windows abrir el protocolo sin navegar la SPA", () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const iframe = {
      setAttribute(name: string, value: string) {
        this[name] = value;
      },
      remove() {
        removed.push("removed");
      },
    } as Record<string, unknown> & { setAttribute: (n: string, v: string) => void; remove: () => void };
    const appended: unknown[] = [];
    const doc = {
      body: {
        appendChild(node: unknown) {
          appended.push(node);
        },
      },
      createElement(tag: string) {
        expect(tag).toBe("iframe");
        return iframe;
      },
    };
    requestLocalRuntimeStart(doc as unknown as Document);
    expect(appended).toHaveLength(1);
    expect(iframe.src).toBe(RUNTIME_START_PROTOCOL);
    vi.advanceTimersByTime(4000);
    expect(removed).toEqual(["removed"]);
    vi.useRealTimers();
  });
});
