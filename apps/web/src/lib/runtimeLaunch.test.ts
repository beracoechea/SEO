import { describe, expect, it } from "vitest";
import { RUNTIME_START_PROTOCOL, requestLocalRuntimeStart } from "./runtimeLaunch";

describe("runtimeLaunch", () => {
  it("usa el protocolo que registra el instalador", () => {
    expect(RUNTIME_START_PROTOCOL).toBe("logicbus-seo://start");
  });

  it("dispara el protocolo con un clic sintético (gesto de usuario)", () => {
    const clicks: string[] = [];
    const a = {
      href: "",
      style: { display: "" },
      click() {
        clicks.push(this.href);
      },
      remove() {
        clicks.push("removed");
      },
    };
    const doc = {
      body: {
        appendChild(node: { href: string }) {
          clicks.push(`append:${node.href}`);
        },
      },
      createElement(tag: string) {
        expect(tag).toBe("a");
        return a;
      },
    };
    requestLocalRuntimeStart(doc as unknown as Document);
    expect(a.href).toBe(RUNTIME_START_PROTOCOL);
    expect(clicks).toEqual([`append:${RUNTIME_START_PROTOCOL}`, RUNTIME_START_PROTOCOL, "removed"]);
  });
});
