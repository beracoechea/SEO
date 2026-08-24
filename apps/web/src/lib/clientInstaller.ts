export type InstallerInput = {
  orgId: string;
  orgName: string;
  firebaseProjectId: string;
  corsOrigin: string;
  runtimeVersion: string;
};

export function psQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function installerSlug(orgName: string): string {
  return (
    (orgName || "cliente")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "cliente"
  );
}

export function installerCmdFileName(orgName: string): string {
  return `Instalar-SEO-${installerSlug(orgName)}.cmd`;
}

export function installerFileName(orgName: string): string {
  return `Instalar-SEO-${installerSlug(orgName)}.zip`;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  return Uint8Array.of(n & 255, (n >>> 8) & 255);
}

function u32(n: number): Uint8Array {
  return Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concatBytes([
      Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    locals.push(local);
    centrals.push(
      concatBytes([
        Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = concatBytes(centrals);
  const eocd = concatBytes([
    Uint8Array.of(0x50, 0x4b, 0x05, 0x06),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concatBytes([...locals, central, eocd]);
}

function installerReadme(cmdName: string): string {
  return [
    "Instalador del motor SEO Logicbus",
    "",
    "1. Extrae este ZIP (clic derecho > Extraer todo).",
    `2. Doble clic en ${cmdName}.`,
    "3. Pulsa Si cuando Windows pida administrador.",
    "",
    "Windows bloquea el .cmd si lo descargas suelto (Control inteligente de aplicaciones).",
    "Por eso va dentro de un ZIP.",
    "",
    "Si al abrir el .cmd Windows lo bloquea:",
    "- Clic derecho en el .cmd > Propiedades > Desbloquear > Aplicar.",
    "- O Configuracion > Privacidad y seguridad > Seguridad de Windows",
    "  > Control de aplicaciones y del navegador > Control inteligente de aplicaciones.",
    "",
  ].join("\r\n");
}

export function buildInstallerZip(input: InstallerInput): Uint8Array {
  const cmdName = installerCmdFileName(input.orgName);
  const cmd = buildInstallerCmd(input);
  const cmdBytes = new TextEncoder().encode(cmd);
  const readme = new TextEncoder().encode(installerReadme(cmdName));
  return zipStore([
    { name: "LEEME.txt", data: readme },
    { name: cmdName, data: cmdBytes },
  ]);
}

const SYSTEM_POWERSHELL = "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
/** Concatenated in the .cmd header so IndexOf does not match the header itself. */
const PS_MARKER = "###LOGICBUS_SEO_PS###";

function installerCmdHeader(): string {
  return [
    "@echo off",
    "setlocal EnableExtensions",
    "title Instalar motor SEO Logicbus",
    `set "PS=${SYSTEM_POWERSHELL}"`,
    "if not exist \"%PS%\" (",
    "  echo Falta Windows PowerShell. Viene con Windows 10 y 11: no hace falta la Microsoft Store.",
    "  pause",
    "  exit /b 1",
    ")",
    "set \"SEO_INSTALL_PS=%TEMP%\\logicbus-seo-install.ps1\"",
    "echo Preparando instalador...",
    "\"%PS%\" -NoProfile -ExecutionPolicy Bypass -Command \"$c=Get-Content -LiteralPath '%~f0' -Raw -Encoding UTF8; $m='###'+'LOGICBUS_SEO_PS'+'###'; if ($c.IndexOf($m) -lt 0) { throw 'instalador danado' }; [IO.File]::WriteAllText($env:SEO_INSTALL_PS, $c.Substring($c.IndexOf($m)+$m.Length).TrimStart(), (New-Object Text.UTF8Encoding $false))\"",
    "if errorlevel 1 (",
    "  echo No se pudo preparar el instalador.",
    "  pause",
    "  exit /b 1",
    ")",
    "net session >nul 2>&1",
    "if errorlevel 1 (",
    "  echo Se pedira permiso de administrador. Pulsa Si. No abras la Microsoft Store.",
    "  \"%PS%\" -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process -LiteralPath '%PS%' -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%SEO_INSTALL_PS%'\"",
    "  exit /b 0",
    ")",
    "\"%PS%\" -NoProfile -ExecutionPolicy Bypass -File \"%SEO_INSTALL_PS%\"",
    "endlocal",
    "exit /b %ERRORLEVEL%",
  ].join("\r\n");
}

export function defaultShellOrigin(origin: string): string {
  const trimmed = (origin || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return "";
    if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) return "";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export const PRODUCTION_SHELL_ORIGIN = "https://bgx-seo-monitor.web.app";
export const PRODUCTION_SHELL_ORIGINS = [
  "https://bgx-seo-monitor.web.app",
  "https://bgx-seo-monitor.firebaseapp.com",
] as const;

export function installerCorsAllowlist(pageOrigin?: string): string {
  const extras = new Set<string>(PRODUCTION_SHELL_ORIGINS);
  for (const part of String(pageOrigin ?? "").split(",")) {
    const fromPage = defaultShellOrigin(part);
    if (fromPage) extras.add(fromPage);
  }
  return [...extras].join(",");
}

export function assertInstallerInput(input: InstallerInput): void {
  if (!input.orgId.trim()) throw new Error("installer.missingOrg");
  if (!input.firebaseProjectId.trim()) throw new Error("installer.missingFirebase");
}

export function buildClientInstaller(input: InstallerInput): string {
  assertInstallerInput(input);
  const cors = installerCorsAllowlist(input.corsOrigin);
  const version = (input.runtimeVersion || "0.1.0").replace(/^v/i, "");
  const tag = `v${version}`;
  const zipTag = `https://github.com/beracoechea/SEO/archive/refs/tags/${tag}.zip`;
  const zipMain = "https://github.com/beracoechea/SEO/archive/refs/heads/main.zip";
  const releases = "https://api.github.com/repos/beracoechea/SEO/releases/latest";

  const lines = [
    "# Instalar / actualizar motor SEO (generado desde la web).",
    "# Ejecutar el .cmd con doble clic (usa el PowerShell de Windows, no la Store).",
    "# Actualizacion silenciosa (no borra SQLite): C:\\seo-runtime\\actualizar.ps1 -Mode Update",
    "# NUNCA uses: docker compose down -v   (eso borra el historial).",
    "param(",
    "  [ValidateSet('Install','Update')]",
    "  [string]$Mode = 'Install'",
    ")",
    "$ErrorActionPreference = 'Stop'",
    `$OrgId = ${psQuote(input.orgId.trim())}`,
    `$OrgName = ${psQuote(input.orgName.trim() || "cliente")}`,
    `$FirebaseProject = ${psQuote(input.firebaseProjectId.trim())}`,
    `$CorsOrigin = ${psQuote(cors)}`,
    `$RuntimeVersion = ${psQuote(version)}`,
    `$TagZip = ${psQuote(zipTag)}`,
    `$MainZip = ${psQuote(zipMain)}`,
    `$ReleasesUrl = ${psQuote(releases)}`,
    `$DockerSetup = ${psQuote("https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe")}`,
    "$InstallRoot = 'C:\\seo-runtime'",
    "$ComposeFile = Join-Path $InstallRoot 'deploy\\cliente\\docker-compose.yml'",
    "$EnvFile = Join-Path $InstallRoot 'deploy\\cliente\\.env'",
    "$VersionFile = Join-Path $InstallRoot 'VERSION.txt'",
    "$LogFile = Join-Path $InstallRoot 'update.log'",
    "$UpdaterFile = Join-Path $InstallRoot 'actualizar.ps1'",
    "$TaskName = 'Logicbus SEO runtime update'",
    "$ScriptPath = $MyInvocation.MyCommand.Path",
    "",
    "function Write-UpdateLog {",
    "  param([string]$Message)",
    "  $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)",
    "  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null",
    "  Add-Content -Path $LogFile -Value $line -Encoding UTF8",
    "  Write-Host $Message",
    "}",
    "",
    "function Refresh-Path {",
    "  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')",
    "  $user = [Environment]::GetEnvironmentVariable('Path','User')",
    "  $env:Path = $machine + ';' + $user",
    "  $bin = 'C:\\Program Files\\Docker\\Docker\\resources\\bin'",
    "  if (Test-Path $bin) { $env:Path = $bin + ';' + $env:Path }",
    "}",
    "",
    "function Get-RemoteFile {",
    "  param([string]$Uri, [string]$OutFile, [string]$Title)",
    "  Write-Host $Title",
    "  Write-Host '  Si tarda, es normal: el archivo es grande. No cierres esta ventana.'",
    "  $folder = Split-Path -Parent $OutFile",
    "  if ($folder) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }",
    "  $req = [System.Net.HttpWebRequest]::Create($Uri)",
    "  $req.UserAgent = 'Logicbus-SEO-installer'",
    "  $req.AllowAutoRedirect = $true",
    "  $res = $req.GetResponse()",
    "  $total = [int64]$res.ContentLength",
    "  $inStream = $res.GetResponseStream()",
    "  $outStream = [IO.File]::Open($OutFile, 'Create')",
    "  $buf = New-Object byte[] 65536",
    "  $got = [int64]0",
    "  $next = 0",
    "  try {",
    "    while (($n = $inStream.Read($buf, 0, $buf.Length)) -gt 0) {",
    "      $outStream.Write($buf, 0, $n)",
    "      $got += $n",
    "      if ($total -gt 0) {",
    "        $pct = [int][Math]::Min(100, [Math]::Floor((100.0 * $got) / $total))",
    "        if ($pct -ge $next -or $got -eq $total) {",
    "          $next = [Math]::Min(100, $pct + 2)",
    "          $mb = [Math]::Round($got / 1MB, 1)",
    "          $all = [Math]::Round($total / 1MB, 1)",
    "          $fill = [int][Math]::Floor((28.0 * $got) / $total)",
    "          $bar = ('#' * $fill) + ('-' * (28 - $fill))",
    "          Write-Host ('  [' + $bar + '] ' + $pct + '%  ' + $mb + ' / ' + $all + ' MB')",
    "          Write-Progress -Activity $Title -Status ($pct.ToString() + '%') -PercentComplete $pct",
    "        }",
    "      } elseif (($got % 5MB) -lt 65536) {",
    "        Write-Host ('  bajados ' + [Math]::Round($got / 1MB, 1) + ' MB')",
    "      }",
    "    }",
    "  } finally {",
    "    $outStream.Close()",
    "    $inStream.Close()",
    "    $res.Close()",
    "    Write-Progress -Activity $Title -Completed",
    "  }",
    "  Write-Host '  listo.'",
    "}",
    "",
    "function Test-DockerReady {",
    "  Refresh-Path",
    "  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }",
    "  docker info 1>$null 2>$null",
    "  return ($LASTEXITCODE -eq 0)",
    "}",
    "",
    "function Wait-Docker {",
    "  param([int]$Tries = 60)",
    "  $wait = 0",
    "  while ($wait -lt $Tries) {",
    "    if (Test-DockerReady) { return $true }",
    "    Write-Host ('Esperando a que Docker Desktop quede Running... ' + ($wait + 1) + '/' + $Tries)",
    "    Start-Sleep -Seconds 5",
    "    $wait++",
    "  }",
    "  return $false",
    "}",
    "",
    "function Install-DockerDesktop {",
    "  Write-Host 'Docker no esta instalado. Se descarga Docker Desktop (oficial, ~500 MB).'",
    "  $setup = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'",
    "  Get-RemoteFile -Uri $DockerSetup -OutFile $setup -Title 'Descargando Docker Desktop'",
    "  Write-Host 'Instalando Docker Desktop (silencioso)...'",
    "  $p = Start-Process -FilePath $setup -ArgumentList @('install','--quiet','--accept-license') -Wait -PassThru",
    "  $code = $p.ExitCode",
    "  Refresh-Path",
    "  $exe = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'",
    "  try { Add-LocalGroupMember -Group 'docker-users' -Member $env:USERNAME -ErrorAction SilentlyContinue } catch {}",
    "  if (Test-Path $exe) { Start-Process $exe }",
    "  if ($code -eq 3010) {",
    "    Write-Host 'Windows pide reiniciar para terminar Docker. Reinicia este PC y vuelve a hacer doble clic en ESTE MISMO archivo .cmd'",
    "    if ($Mode -ne 'Update') { pause }",
    "    exit 0",
    "  }",
    "  if ($code -ne 0 -and -not (Test-Path $exe)) {",
    "    throw ('No se pudo instalar Docker Desktop (codigo ' + $code + '). Descarga https://www.docker.com/products/docker-desktop/ y reintenta este script.')",
    "  }",
    "}",
    "",
    "function Test-Admin {",
    "  $id = [Security.Principal.WindowsIdentity]::GetCurrent()",
    "  $p = New-Object Security.Principal.WindowsPrincipal($id)",
    "  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
    "}",
    "",
    "function Read-EnvMap {",
    "  $map = @{}",
    "  if (Test-Path $EnvFile) {",
    "    Get-Content $EnvFile -ErrorAction SilentlyContinue | ForEach-Object {",
    "      if ($_ -match '^\\s*#' -or $_ -notmatch '=') { return }",
    "      $i = $_.IndexOf('=')",
    "      $k = $_.Substring(0, $i).Trim()",
    "      $v = $_.Substring($i + 1)",
    "      if ($k) { $map[$k] = $v }",
    "    }",
    "  }",
    "  return $map",
    "}",
    "",
    "function Write-RuntimeEnv {",
    "  param([switch]$KeepExtra)",
    "  $map = @{}",
    "  if ($KeepExtra) { $map = Read-EnvMap }",
    "  $map['ORG_ID'] = $OrgId",
    "  $map['FIREBASE_PROJECT_ID'] = $FirebaseProject",
    "  if (-not $map.ContainsKey('FIRESTORE_DATABASE')) { $map['FIRESTORE_DATABASE'] = 'webs' }",
    "  $map['CORS_ORIGIN'] = $CorsOrigin",
    "  if (-not $map.ContainsKey('RUNTIME_PORT')) { $map['RUNTIME_PORT'] = '8080' }",
    "  $map['RUNTIME_VERSION'] = $RuntimeVersion",
    "  New-Item -ItemType Directory -Force -Path (Split-Path $EnvFile) | Out-Null",
    "  $lines = @()",
    "  foreach ($k in @('ORG_ID','FIREBASE_PROJECT_ID','FIRESTORE_DATABASE','CORS_ORIGIN','RUNTIME_PORT','RUNTIME_VERSION')) {",
    "    $lines += ($k + '=' + $map[$k])",
    "    $map.Remove($k)",
    "  }",
    "  foreach ($k in ($map.Keys | Sort-Object)) {",
    "    $lines += ($k + '=' + $map[$k])",
    "  }",
    "  $lines | Set-Content -Path $EnvFile -Encoding ASCII",
    "}",
    "",
    "function Get-RuntimeHealth {",
    "  try {",
    "    return Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 3",
    "  } catch {",
    "    return $null",
    "  }",
    "}",
    "",
    "function Test-CrawlBusy {",
    "  $h = Get-RuntimeHealth",
    "  if ($null -eq $h) { return $false }",
    "  return [bool]$h.busy",
    "}",
    "",
    "function Get-RemoteRuntime {",
    "  try {",
    "    $rel = Invoke-RestMethod -Uri $ReleasesUrl -TimeoutSec 20",
    "    if ($rel.tag_name) {",
    "      $ver = ([string]$rel.tag_name).TrimStart('v')",
    "      $zip = $rel.zipball_url",
    "      if (-not $zip) { $zip = ('https://github.com/beracoechea/SEO/archive/refs/tags/' + $rel.tag_name + '.zip') }",
    "      return @{ Version = $ver; Zip = $zip }",
    "    }",
    "  } catch {}",
    "  try {",
    "    Invoke-WebRequest -Uri $TagZip -Method Head -UseBasicParsing -TimeoutSec 15 | Out-Null",
    "    return @{ Version = $RuntimeVersion; Zip = $TagZip }",
    "  } catch {}",
    "  return @{ Version = 'main'; Zip = $MainZip }",
    "}",
    "",
    "function Install-RuntimeFiles {",
    "  param([string]$ZipUrl)",
    "  $tmpZip = Join-Path $env:TEMP 'seo-runtime-src.zip'",
    "  $unpack = Join-Path $env:TEMP 'seo-runtime-unpack'",
    "  if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }",
    "  Write-UpdateLog 'Descargando el runtime...'",
    "  Get-RemoteFile -Uri $ZipUrl -OutFile $tmpZip -Title 'Descargando el motor SEO'",
    "  Expand-Archive -Path $tmpZip -DestinationPath $unpack -Force",
    "  $inner = Get-ChildItem $unpack | Select-Object -First 1",
    "  $envBackup = $null",
    "  if (Test-Path $EnvFile) { $envBackup = Get-Content $EnvFile -Raw }",
    "  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null",
    "  Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $InstallRoot -Recurse -Force",
    "  if ($envBackup) {",
    "    New-Item -ItemType Directory -Force -Path (Split-Path $EnvFile) | Out-Null",
    "    Set-Content -Path $EnvFile -Value $envBackup -Encoding ASCII",
    "  }",
    "}",
    "",
    "function Stop-RuntimeSafe {",
    "  if (-not (Test-Path $ComposeFile)) { return }",
    "  Write-UpdateLog 'Deteniendo el contenedor (se conserva el volumen runtime-data / SQLite)...'",
    "  Push-Location $InstallRoot",
    "  try {",
    "    docker compose -f $ComposeFile --env-file $EnvFile stop",
    "  } finally {",
    "    Pop-Location",
    "  }",
    "}",
    "",
    "function Start-Runtime {",
    "  Write-UpdateLog 'Levantando el motor (docker compose up -d --build; sin down -v)...'",
    "  Push-Location $InstallRoot",
    "  try {",
    "    docker compose -f $ComposeFile --env-file $EnvFile up -d --build",
    "    if ($LASTEXITCODE -ne 0) { throw 'docker compose fallo. Revisa que Docker Desktop este Running.' }",
    "  } finally {",
    "    Pop-Location",
    "  }",
    "}",
    "",
    "function Wait-RuntimeHealth {",
    "  param([int]$Tries = 30)",
    "  $health = $null",
    "  $wait = 0",
    "  while (-not $health -and $wait -lt $Tries) {",
    "    $health = Get-RuntimeHealth",
    "    if (-not $health) {",
    "      Start-Sleep -Seconds 2",
    "      $wait++",
    "    }",
    "  }",
    "  return $health",
    "}",
    "",
    "function Register-SilentUpdate {",
    "  try {",
    "    Copy-Item -Path $ScriptPath -Destination $UpdaterFile -Force",
    "    $psExe = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "    $args = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $UpdaterFile + '\" -Mode Update'",
    "    $action = New-ScheduledTaskAction -Execute $psExe -Argument $args",
    "    $daily = New-ScheduledTaskTrigger -Daily -At 3:20am",
    "    $logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
    "    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)",
    "    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($daily, $logon) -Settings $settings -User $env:USERNAME -RunLevel Highest -Force | Out-Null",
    "    Write-UpdateLog ('Tarea programada: ' + $TaskName)",
    "  } catch {",
    "    Write-UpdateLog ('No se pudo registrar la actualizacion automatica: ' + $_.Exception.Message)",
    "  }",
    "}",
    "",
    "if (-not (Test-Admin)) {",
    "  if ($Mode -eq 'Update') {",
    "    Write-UpdateLog 'Actualizacion sin administrador; se intenta igual.'",
    "  } else {",
    "    Write-Host 'Se pide administrador para instalar Docker (si falta) y el firewall de la LAN.'",
    "    $here = $ScriptPath",
    "    $psExe = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "    Start-Process -FilePath $psExe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $here, '-Mode', $Mode)",
    "    exit 0",
    "  }",
    "}",
    "",
    "Write-UpdateLog ('Logicbus SEO - ' + $Mode + ' para ' + $OrgName + ' ORG_ID ' + $OrgId)",
    "Refresh-Path",
    "",
    "if ($Mode -eq 'Update') {",
    "  if (-not (Test-DockerReady)) {",
    "    $exe = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'",
    "    if (Test-Path $exe) { Start-Process $exe }",
    "    if (-not (Wait-Docker -Tries 24)) {",
    "      Write-UpdateLog 'Docker Desktop no esta Running; se omite esta pasada.'",
    "      exit 0",
    "    }",
    "  }",
    "  if (Test-CrawlBusy) {",
    "    Write-UpdateLog 'Hay un escaneo en curso; no se actualiza para no cortar ni tocar SQLite. Se reintenta en la proxima pasada.'",
    "    exit 0",
    "  }",
    "  $remote = Get-RemoteRuntime",
    "  $local = ''",
    "  if (Test-Path $VersionFile) { $local = (Get-Content $VersionFile -Raw).Trim() }",
    "  if ($local -and $local -eq $remote.Version -and $remote.Version -ne 'main') {",
    "    Write-UpdateLog ('Ya esta en ' + $local + '; no hay tag nuevo.')",
    "    exit 0",
    "  }",
    "  Stop-RuntimeSafe",
    "  try {",
    "    Install-RuntimeFiles -ZipUrl $remote.Zip",
    "  } catch {",
    "    Write-UpdateLog ('Fallo la descarga; se vuelve a levantar el motor actual. ' + $_.Exception.Message)",
    "    if (Test-Path $ComposeFile) { Start-Runtime }",
    "    exit 1",
    "  }",
    "  Write-RuntimeEnv -KeepExtra",
    "  Start-Runtime",
    "  $health = Wait-RuntimeHealth",
    "  if (-not $health) {",
    "    Write-UpdateLog 'El motor no respondio tras actualizar.'",
    "    exit 1",
    "  }",
    "  Set-Content -Path $VersionFile -Value $remote.Version -Encoding ASCII",
    "  try { Copy-Item -Path $ScriptPath -Destination $UpdaterFile -Force } catch {}",
    "  Write-UpdateLog ('Actualizado a ' + $remote.Version + '. Volumen runtime-data intacto.')",
    "  exit 0",
    "}",
    "",
    "if (-not (Test-DockerReady)) {",
    "  $exe = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'",
    "  if (Test-Path $exe) { Start-Process $exe } else { Install-DockerDesktop }",
    "}",
    "if (-not (Wait-Docker)) {",
    "  $exe = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'",
    "  if (Test-Path $exe) { Start-Process $exe }",
    "  if (-not (Wait-Docker -Tries 24)) {",
    "    throw 'Docker Desktop no quedo Running. Si Windows pidio reinicio, reinicia y vuelve a hacer doble clic en este mismo .cmd'",
    "  }",
    "}",
    "",
    "New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null",
    "if (-not (Test-Path $ComposeFile)) {",
    "  $remote = Get-RemoteRuntime",
    "  try {",
    "    Install-RuntimeFiles -ZipUrl $remote.Zip",
    "  } catch {",
    "    Write-Host 'No hubo tag; se usa main.'",
    "    Install-RuntimeFiles -ZipUrl $MainZip",
    "    $remote = @{ Version = 'main'; Zip = $MainZip }",
    "  }",
    "  Set-Content -Path $VersionFile -Value $remote.Version -Encoding ASCII",
    "}",
    "",
    "Write-RuntimeEnv -KeepExtra",
    "Start-Runtime",
    "",
    "if (Test-Admin) {",
    "  netsh advfirewall firewall delete rule name='SEO runtime LAN' 1>$null 2>$null",
    "  netsh advfirewall firewall add rule name='SEO runtime LAN' dir=in action=allow protocol=TCP localport=8080 profile=private | Out-Null",
    "}",
    "",
    "$health = Wait-RuntimeHealth",
    "if (-not $health) { throw 'El motor no respondio en http://127.0.0.1:8080/api/health' }",
    "Register-SilentUpdate",
    "",
    "$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {",
    "  $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'",
    "} | Select-Object -ExpandProperty IPAddress)",
    "Write-Host ''",
    "Write-Host 'Listo. En ESTE PC: http://127.0.0.1:8080/api/health'",
    "if ($ips.Count -gt 0) {",
    "  Write-Host 'En la oficina usa (misma LAN):'",
    "  $ips | ForEach-Object { Write-Host ('  http://' + $_ + ':8080') }",
    "}",
    "Write-Host ($health | ConvertTo-Json -Compress)",
    "Write-Host ''",
    "Write-Host 'El motor se actualiza solo (tarea diaria 03:20 y al iniciar sesion). No expongas el 8080 a internet.'",
    "pause",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function buildInstallerCmd(input: InstallerInput): string {
  return `${installerCmdHeader()}\r\n${PS_MARKER}\r\n${buildClientInstaller(input)}`;
}

export const INSTALLER_RUNTIME_VERSION = "0.1.0";

export function installerCorsOrigin(pageOrigin?: string): string {
  return installerCorsAllowlist(pageOrigin ?? (typeof window !== "undefined" ? window.location.origin : ""));
}

export function downloadOrgInstaller(org: { id: string; name: string }) {
  const project = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();
  downloadClientInstaller({
    orgId: org.id,
    orgName: org.name,
    firebaseProjectId: project,
    corsOrigin: installerCorsOrigin(),
    runtimeVersion: INSTALLER_RUNTIME_VERSION,
  });
}

export function downloadClientInstaller(input: InstallerInput) {
  const zip = buildInstallerZip(input);
  const buffer = new ArrayBuffer(zip.byteLength);
  new Uint8Array(buffer).set(zip);
  const blob = new Blob([buffer], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = installerFileName(input.orgName);
  link.click();
  URL.revokeObjectURL(link.href);
}
