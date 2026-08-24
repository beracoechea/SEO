import { describe, expect, it } from "vitest";
import { loopbackRuntimeUrl } from "./runtime";

describe("loopbackRuntimeUrl", () => {
  it("cambia localhost a 127.0.0.1 (Windows usa IPv6 en localhost)", () => {
    expect(loopbackRuntimeUrl("http://localhost:8080")).toBe("http://127.0.0.1:8080");
    expect(loopbackRuntimeUrl("http://LOCALHOST:8080/api/health")).toBe("http://127.0.0.1:8080/api/health");
    expect(loopbackRuntimeUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    expect(loopbackRuntimeUrl("http://192.168.1.20:8080")).toBe("http://192.168.1.20:8080");
  });
});
