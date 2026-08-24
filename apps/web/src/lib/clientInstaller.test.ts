import { describe, expect, it } from "vitest";
import {
  assertInstallerInput,
  buildClientInstaller,
  buildInstallerCmd,
  buildInstallerZip,
  defaultShellOrigin,
  installerCmdFileName,
  installerCorsAllowlist,
  installerCorsOrigin,
  installerFileName,
  psQuote,
} from "./clientInstaller";

describe("clientInstaller", () => {
  it("escapa comillas para PowerShell", () => {
    expect(psQuote("acme")).toBe("'acme'");
    expect(psQuote("a'b")).toBe("'a''b'");
  });

  it("nombra el archivo con el cliente", () => {
    expect(installerFileName("Acme SA de CV")).toBe("Instalar-SEO-Acme_SA_de_CV.zip");
    expect(installerCmdFileName("Acme SA de CV")).toBe("Instalar-SEO-Acme_SA_de_CV.cmd");
  });

  it("no usa localhost como origen de la cascara", () => {
    expect(defaultShellOrigin("http://localhost:5173")).toBe("");
    expect(defaultShellOrigin("https://seo.web.app")).toBe("https://seo.web.app");
    expect(installerCorsOrigin("http://localhost:5173")).toContain("https://bgx-seo-monitor.web.app");
    expect(installerCorsOrigin("http://localhost:5173")).toContain("https://bgx-seo-monitor.firebaseapp.com");
    expect(installerCorsAllowlist("https://seo.web.app")).toContain("https://seo.web.app");
    expect(installerCorsAllowlist("https://seo.web.app")).toContain("https://bgx-seo-monitor.web.app");
  });

  it("exige org y firebase; localhost no bloquea el allowlist de produccion", () => {
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
    ).not.toThrow();
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
    expect(script).toContain("https://bgx-seo-monitor.web.app");
    expect(script).toContain("https://bgx-seo-monitor.firebaseapp.com");
    expect(script).toContain("https://seo.web.app");
    expect(script).toContain("docker compose");
    expect(script).toContain("C:\\seo-runtime");
    expect(script).toContain("desktop.docker.com");
    expect(script).toContain("Install-DockerDesktop");
    expect(script).toContain("accept-license");
    expect(script).toContain("-Mode Update");
    expect(script).toContain("'--env-file',$EnvFile,'stop'");
    expect(script).toContain("runtime-data");
    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("actualizar.ps1");
    expect(script).toContain("Get-RemoteFile");
    expect(script).toContain("Write-Progress");
    expect(script).toContain("bajados");
    expect(script).not.toContain("campo motor LAN");
    expect(script).not.toMatch(/(^|\n)\s*docker compose down -v/);
  });

  it("el archivo descargable es un .cmd que usa el PowerShell de Windows, no la Store", () => {
    const cmd = buildInstallerCmd({
      orgId: "org123",
      orgName: "Acme",
      firebaseProjectId: "clima-laboral-e7698",
      corsOrigin: "https://seo.web.app",
      runtimeVersion: "0.1.0",
    });
    expect(cmd).toContain("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(cmd).toContain("###LOGICBUS_SEO_PS###");
    expect(cmd.indexOf("###LOGICBUS_SEO_PS###")).toBe(cmd.lastIndexOf("###LOGICBUS_SEO_PS###"));
    expect(cmd).toContain("$OrgId = 'org123'");
    expect(cmd).toContain("Get-RemoteFile");
    expect(cmd).toContain("Write-Progress");
    expect(cmd).toContain("function Wait-Docker");
    expect(cmd).toContain("if (Test-DockerReady) { return $true }");
    expect(cmd).toContain("Get-DockerExe");
    expect(cmd).toContain("SetupAdmin");
    expect(cmd).not.toContain("net session");
    expect(cmd).toContain("'###'+'LOGICBUS_SEO_PS'+'###'");
    expect(cmd.charCodeAt(0)).toBe("@".charCodeAt(0));
    expect(cmd).not.toContain("Start-Process -FilePath powershell.exe");
  });

  it("empaqueta el .cmd en un zip para que Windows no bloquee la descarga", () => {
    const zip = buildInstallerZip({
      orgId: "org123",
      orgName: "Acme",
      firebaseProjectId: "clima-laboral-e7698",
      corsOrigin: "https://seo.web.app",
      runtimeVersion: "0.1.0",
    });
    const text = new TextDecoder().decode(zip);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(text).toContain("Instalar-SEO-Acme.cmd");
    expect(text).toContain("LEEME.txt");
    expect(text).toContain("$OrgId = 'org123'");
    expect(text).not.toContain("\uFEFF@echo");
    expect(text).toContain("@echo off");
  });
});
