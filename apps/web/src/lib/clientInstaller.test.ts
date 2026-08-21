import { describe, expect, it } from "vitest";
import {
  assertInstallerInput,
  buildClientInstaller,
  defaultShellOrigin,
  installerFileName,
  psQuote,
} from "./clientInstaller";

describe("clientInstaller", () => {
  it("escapa comillas para PowerShell", () => {
    expect(psQuote("acme")).toBe("'acme'");
    expect(psQuote("a'b")).toBe("'a''b'");
  });

  it("nombra el archivo con el cliente", () => {
    expect(installerFileName("Acme SA de CV")).toBe("Instalar-SEO-Acme_SA_de_CV.ps1");
  });

  it("no usa localhost como origen de la cascara", () => {
    expect(defaultShellOrigin("http://localhost:5173")).toBe("");
    expect(defaultShellOrigin("https://seo.web.app")).toBe("https://seo.web.app");
  });

  it("exige org, firebase y HTTPS publico", () => {
    expect(() =>
      assertInstallerInput({
        orgId: "",
        orgName: "A",
        firebaseProjectId: "p",
        corsOrigin: "https://seo.web.app",
        runtimeVersion: "0.1.0",
      }),
    ).toThrow("installer.missingOrg");
    expect(() =>
      assertInstallerInput({
        orgId: "abc",
        orgName: "A",
        firebaseProjectId: "p",
        corsOrigin: "http://localhost:5173",
        runtimeVersion: "0.1.0",
      }),
    ).toThrow("installer.corsHttps");
  });

  it("incrusta el ORG_ID y no pide editar el env a mano", () => {
    const script = buildClientInstaller({
      orgId: "org123",
      orgName: "Acme",
      firebaseProjectId: "clima-laboral-e7698",
      corsOrigin: "https://seo.web.app",
      runtimeVersion: "0.1.0",
    });
    expect(script).toContain("$OrgId = 'org123'");
    expect(script).toContain("$FirebaseProject = 'clima-laboral-e7698'");
    expect(script).toContain("$CorsOrigin = 'https://seo.web.app'");
    expect(script).toContain("docker compose");
    expect(script).toContain("C:\\seo-runtime");
    expect(script).toContain("desktop.docker.com");
    expect(script).toContain("Install-DockerDesktop");
    expect(script).toContain("accept-license");
    expect(script).toContain("-Mode Update");
    expect(script).toContain("--env-file $EnvFile stop");
    expect(script).toContain("runtime-data");
    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("actualizar.ps1");
    expect(script).not.toMatch(/(^|\n)\s*docker compose down -v/);
  });
});
