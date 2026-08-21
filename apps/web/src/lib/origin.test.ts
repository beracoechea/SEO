import { describe, expect, it } from "vitest";
import { isPrivateOrigin } from "./origin";

describe("isPrivateOrigin", () => {
  it("acepta sitios HTTPS públicos", () => {
    expect(isPrivateOrigin("https://www.logicbus.com.mx")).toBe(false);
    expect(isPrivateOrigin("https://shop.example.com/es")).toBe(false);
  });

  it("bloquea localhost, .local e IPs privadas", () => {
    expect(isPrivateOrigin("https://localhost")).toBe(true);
    expect(isPrivateOrigin("http://intranet.local")).toBe(true);
    expect(isPrivateOrigin("http://127.0.0.1")).toBe(true);
    expect(isPrivateOrigin("http://192.168.1.10")).toBe(true);
    expect(isPrivateOrigin("http://10.0.0.4")).toBe(true);
    expect(isPrivateOrigin("http://172.16.0.8")).toBe(true);
  });

  it("trata URLs inválidas como prohibidas", () => {
    expect(isPrivateOrigin("not-a-url")).toBe(true);
    expect(isPrivateOrigin("")).toBe(true);
  });
});
