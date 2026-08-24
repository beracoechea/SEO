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
    "3. Espera a que la ventana diga Listo (la primera vez tarda: baja Python y Chromium).",
    "4. En la web pulsa Ya esta listo.",
    "",
    "No hace falta Docker ni entrar a la BIOS.",
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
    "echo Instalando el motor SEO (sin Docker). La primera vez tarda; no cierres esta ventana.",
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
  const pythonEmbed = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip";
  const pythonSetup = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe";
  const getPip = "https://bootstrap.pypa.io/get-pip.py";

  const lines = [
    "# Instalar / actualizar motor SEO (generado desde la web).",
    "# Ejecutar el .cmd con doble clic (usa el PowerShell de Windows, no la Store).",
    "# El motor corre con Python en C:\\seo-runtime. No usa Docker ni virtualizacion.",
    "# Actualizacion silenciosa (no borra SQLite): C:\\seo-runtime\\actualizar.ps1 -Mode Update",
    "# No borres C:\\seo-runtime\\data (ahi esta el historial).",
    "param(",
    "  [ValidateSet('Install','Update','Start')]",
    "  [string]$Mode = 'Install'",
    ")",
    "$ErrorActionPreference = 'Stop'",
    "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}",
    `$OrgId = ${psQuote(input.orgId.trim())}`,
    `$OrgName = ${psQuote(input.orgName.trim() || "cliente")}`,
    `$FirebaseProject = ${psQuote(input.firebaseProjectId.trim())}`,
    `$CorsOrigin = ${psQuote(cors)}`,
    `$RuntimeVersion = ${psQuote(version)}`,
    `$TagZip = ${psQuote(zipTag)}`,
    `$MainZip = ${psQuote(zipMain)}`,
    `$ReleasesUrl = ${psQuote(releases)}`,
    `$PythonEmbedZip = ${psQuote(pythonEmbed)}`,
    `$PythonSetup = ${psQuote(pythonSetup)}`,
    `$GetPipUrl = ${psQuote(getPip)}`,
    "$InstallRoot = 'C:\\seo-runtime'",
    "$AppDir = Join-Path $InstallRoot 'apps\\runtime'",
    "$AppMain = Join-Path $AppDir 'app\\main.py'",
    "$EnvFile = Join-Path $AppDir '.env'",
    "$LegacyEnvFile = Join-Path $InstallRoot 'deploy\\cliente\\.env'",
    "$DataDir = Join-Path $InstallRoot 'data'",
    "$PythonDir = Join-Path $InstallRoot 'python'",
    "$PythonExe = Join-Path $PythonDir 'python.exe'",
    "$PidFile = Join-Path $InstallRoot 'runtime.pid'",
    "$OutLog = Join-Path $InstallRoot 'runtime.log'",
    "$ErrLog = Join-Path $InstallRoot 'runtime.err.log'",
    "$VersionFile = Join-Path $InstallRoot 'VERSION.txt'",
    "$LogFile = Join-Path $InstallRoot 'update.log'",
    "$UpdaterFile = Join-Path $InstallRoot 'actualizar.ps1'",
    "$TaskName = 'Logicbus SEO runtime update'",
    "$StartTaskName = 'Logicbus SEO runtime'",
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
    "function Invoke-Pause {",
    "  cmd /c pause | Out-Null",
    "}",
    "",
    "function Get-RemoteFile {",
    "  param([string]$Uri, [string]$OutFile, [string]$Title)",
    "  Write-Host $Title",
    "  Write-Host '  Si tarda, es normal: el archivo es grande. No cierres esta ventana.'",
    "  $folder = Split-Path -Parent $OutFile",
    "  if ($folder) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }",
    "  $req = [System.Net.HttpWebRequest]::Create($Uri)",
    "  $req.UserAgent = 'Mozilla/5.0 Logicbus-SEO-installer'",
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
    "function Test-PythonReady {",
    "  if (-not (Test-Path $PythonExe)) { return $false }",
    "  $prev = $ErrorActionPreference",
    "  $ErrorActionPreference = 'Continue'",
    "  & $PythonExe -c \"import pip\" 1>$null 2>$null",
    "  $ok = ($LASTEXITCODE -eq 0)",
    "  $ErrorActionPreference = $prev",
    "  return $ok",
    "}",
    "",
    "function Test-RuntimeDeps {",
    "  if (-not (Test-Path $PythonExe)) { return $false }",
    "  $prev = $ErrorActionPreference",
    "  $ErrorActionPreference = 'Continue'",
    "  & $PythonExe -c \"import uvicorn, playwright, fastapi\" 1>$null 2>$null",
    "  $ok = ($LASTEXITCODE -eq 0)",
    "  $ErrorActionPreference = $prev",
    "  return $ok",
    "}",
    "",
    "function Install-EmbeddedPython {",
    "  $zip = Join-Path $env:TEMP 'seo-python-embed.zip'",
    "  Get-RemoteFile -Uri $PythonEmbedZip -OutFile $zip -Title 'Descargando Python'",
    "  New-Item -ItemType Directory -Force -Path $PythonDir | Out-Null",
    "  Expand-Archive -Path $zip -DestinationPath $PythonDir -Force",
    "  $pth = Get-ChildItem $PythonDir -Filter '*.pth' | Select-Object -First 1",
    "  if ($pth) {",
    "    @('python312.zip', '.', 'Lib\\site-packages', 'import site') | Set-Content -Path $pth.FullName -Encoding ASCII",
    "  }",
    "  $getPip = Join-Path $env:TEMP 'seo-get-pip.py'",
    "  Get-RemoteFile -Uri $GetPipUrl -OutFile $getPip -Title 'Descargando pip'",
    "  & $PythonExe $getPip --no-warn-script-location",
    "  if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar pip.' }",
    "}",
    "",
    "function Install-PythonQuiet {",
    "  $setup = Join-Path $env:TEMP 'seo-python-setup.exe'",
    "  Get-RemoteFile -Uri $PythonSetup -OutFile $setup -Title 'Descargando el instalador de Python'",
    "  $p = Start-Process -FilePath $setup -ArgumentList @('/quiet','InstallAllUsers=0','PrependPath=0','Include_test=0','Include_launcher=0','Include_tcltk=0','Include_pip=1','Shortcuts=0',('TargetDir=' + $PythonDir)) -Wait -PassThru",
    "  return (($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) -and (Test-Path $PythonExe))",
    "}",
    "",
    "function Install-PortablePython {",
    "  if (Test-PythonReady) { return }",
    "  Write-UpdateLog 'Instalando Python en C:\\seo-runtime\\python (no hace falta Docker ni BIOS)...'",
    "  $ok = $false",
    "  try { $ok = [bool](Install-PythonQuiet) } catch { $ok = $false }",
    "  if (-not $ok) { Install-EmbeddedPython }",
    "  if (-not (Test-PythonReady)) { throw 'No se pudo instalar Python. Reintenta el instalador; no hace falta administrador, Docker ni virtualizacion.' }",
    "}",
    "",
    "function Install-RuntimeDeps {",
    "  $req = Join-Path $AppDir 'requirements.txt'",
    "  if (-not (Test-Path $req)) { throw 'Falta apps\\runtime\\requirements.txt. Reintenta el instalador.' }",
    "  Write-UpdateLog 'Instalando librerias del motor (pip)...'",
    "  & $PythonExe -m pip install -r $req --disable-pip-version-check",
    "  if ($LASTEXITCODE -ne 0) { throw 'pip install fallo.' }",
    "  Write-Host 'Descargando Chromium (Playwright). La primera vez tarda varios minutos. No cierres esta ventana.'",
    "  & $PythonExe -m playwright install chromium",
    "  if ($LASTEXITCODE -ne 0) { throw 'playwright install chromium fallo.' }",
    "}",
    "",
    "function Get-PortPids {",
    "  param([int]$Port = 8080)",
    "  $ids = @()",
    "  try {",
    "    $ids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)",
    "  } catch {",
    "    foreach ($ln in (netstat -ano | Select-String (':' + $Port + ' '))) {",
    "      if ($ln.Line -match '\\sLISTENING\\s+(\\d+)\\s*$') { $ids += [int]$Matches[1] }",
    "    }",
    "  }",
    "  return @($ids | Where-Object { $_ -gt 4 } | Select-Object -Unique)",
    "}",
    "",
    "function Read-EnvMap {",
    "  $map = @{}",
    "  foreach ($f in @($LegacyEnvFile, $EnvFile)) {",
    "    if (-not (Test-Path $f)) { continue }",
    "    Get-Content $f -ErrorAction SilentlyContinue | ForEach-Object {",
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
    "  $map['DATA_DIR'] = $DataDir",
    "  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null",
    "  New-Item -ItemType Directory -Force -Path (Split-Path $EnvFile) | Out-Null",
    "  $lines = @()",
    "  foreach ($k in @('ORG_ID','FIREBASE_PROJECT_ID','FIRESTORE_DATABASE','CORS_ORIGIN','RUNTIME_PORT','RUNTIME_VERSION','DATA_DIR')) {",
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
    "  elseif (Test-Path $LegacyEnvFile) { $envBackup = Get-Content $LegacyEnvFile -Raw }",
    "  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null",
    "  Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $InstallRoot -Recurse -Force",
    "  if ($envBackup) {",
    "    New-Item -ItemType Directory -Force -Path (Split-Path $EnvFile) | Out-Null",
    "    Set-Content -Path $EnvFile -Value $envBackup -Encoding ASCII",
    "  }",
    "}",
    "",
    "function Stop-RuntimeSafe {",
    "  Write-UpdateLog 'Deteniendo el motor (se conserva C:\\seo-runtime\\data)...'",
    "  foreach ($procId in Get-PortPids) {",
    "    try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}",
    "  }",
    "  if (Test-Path $PidFile) {",
    "    $old = 0",
    "    try { $old = [int]((Get-Content $PidFile -Raw).Trim()) } catch { $old = 0 }",
    "    if ($old -gt 4) { try { Stop-Process -Id $old -Force -ErrorAction SilentlyContinue } catch {} }",
    "    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue",
    "  }",
    "  Start-Sleep -Seconds 2",
    "}",
    "",
    "function Start-Runtime {",
    "  if (Get-RuntimeHealth) { Write-UpdateLog 'El motor ya responde en 8080.'; return }",
    "  $busy = @(Get-PortPids)",
    "  if ($busy.Count -gt 0) {",
    "    throw 'El puerto 8080 esta ocupado. Cierra Docker Desktop u otro programa en ese puerto y reintenta.'",
    "  }",
    "  if (-not (Test-Path $AppMain)) { throw 'Falta el codigo del motor en C:\\seo-runtime\\apps\\runtime.' }",
    "  Install-PortablePython",
    "  if (-not (Test-RuntimeDeps)) { Install-RuntimeDeps }",
    "  Write-UpdateLog 'Levantando el motor (uvicorn en el puerto 8080)...'",
    "  foreach ($f in @($OutLog, $ErrLog)) {",
    "    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }",
    "  }",
    "  $p = Start-Process -FilePath $PythonExe -ArgumentList @('-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8080') -WorkingDirectory $AppDir -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru",
    "  if (-not $p) { throw 'No se pudo arrancar uvicorn.' }",
    "  Set-Content -Path $PidFile -Value $p.Id -Encoding ASCII",
    "}",
    "",
    "function Wait-RuntimeHealth {",
    "  param([int]$Tries = 90)",
    "  $health = $null",
    "  $wait = 0",
    "  while (-not $health -and $wait -lt $Tries) {",
    "    $health = Get-RuntimeHealth",
    "    if (-not $health) {",
    "      if (($wait % 5) -eq 0) { Write-Host ('Esperando el motor en http://127.0.0.1:8080/api/health ... ' + ($wait + 1) + '/' + $Tries) }",
    "      Start-Sleep -Seconds 4",
    "      $wait++",
    "    }",
    "  }",
    "  return $health",
    "}",
    "",
    "function Show-RuntimeLogs {",
    "  foreach ($f in @($ErrLog, $OutLog)) {",
    "    if (Test-Path $f) {",
    "      Write-Host ('--- ' + (Split-Path $f -Leaf) + ' ---')",
    "      Get-Content $f -Tail 40 -ErrorAction SilentlyContinue",
    "    }",
    "  }",
    "}",
    "",
    "function Open-LanFirewall {",
    "  netsh advfirewall firewall delete rule name='SEO runtime LAN' 1>$null 2>$null",
    "  netsh advfirewall firewall add rule name='SEO runtime LAN' dir=in action=allow protocol=TCP localport=8080 profile=private | Out-Null",
    "}",
    "",
    "function Register-SilentUpdate {",
    "  try {",
    "    Copy-Item -Path $ScriptPath -Destination $UpdaterFile -Force",
    "    $psExe = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "    $startArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $UpdaterFile + '\" -Mode Start'",
    "    $updateArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $UpdaterFile + '\" -Mode Update'",
    "    $startAction = New-ScheduledTaskAction -Execute $psExe -Argument $startArgs",
    "    $updateAction = New-ScheduledTaskAction -Execute $psExe -Argument $updateArgs",
    "    $logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
    "    $daily = New-ScheduledTaskTrigger -Daily -At 3:20am",
    "    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)",
    "    Register-ScheduledTask -TaskName $StartTaskName -Action $startAction -Trigger $logon -Settings $settings -User $env:USERNAME -RunLevel Limited -Force | Out-Null",
    "    Register-ScheduledTask -TaskName $TaskName -Action $updateAction -Trigger $daily -Settings $settings -User $env:USERNAME -RunLevel Limited -Force | Out-Null",
    "    Write-UpdateLog ('Tareas programadas: ' + $StartTaskName + ' (al iniciar sesion) y ' + $TaskName + ' (03:20)')",
    "  } catch {",
    "    Write-UpdateLog ('No se pudo registrar la tarea automatica: ' + $_.Exception.Message)",
    "  }",
    "}",
    "",
    "function Install-RuntimeSource {",
    "  if (Test-Path $AppMain) {",
    "    Write-UpdateLog 'Ya hay codigo del motor en C:\\seo-runtime; no se vuelve a bajar.'",
    "    return",
    "  }",
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
    "function Start-EngineOrThrow {",
    "  Write-RuntimeEnv -KeepExtra",
    "  Install-PortablePython",
    "  Start-Runtime",
    "  $health = Wait-RuntimeHealth",
    "  if (-not $health) {",
    "    Show-RuntimeLogs",
    "    throw 'El motor no respondio en http://127.0.0.1:8080/api/health. Reintenta el .cmd; no hace falta Docker ni administrador.'",
    "  }",
    "  return $health",
    "}",
    "",
    "Write-UpdateLog ('Logicbus SEO - ' + $Mode + ' para ' + $OrgName + ' ORG_ID ' + $OrgId)",
    "New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null",
    "New-Item -ItemType Directory -Force -Path $DataDir | Out-Null",
    "",
    "if ($Mode -eq 'Start') {",
    "  if (-not (Test-Path $AppMain)) { Write-UpdateLog 'Aun no hay motor instalado; se omite el arranque.'; exit 0 }",
    "  try {",
    "    Start-EngineOrThrow | Out-Null",
    "    Write-UpdateLog 'Motor en marcha.'",
    "    exit 0",
    "  } catch {",
    "    Write-UpdateLog ('No se pudo arrancar el motor: ' + $_.Exception.Message)",
    "    exit 1",
    "  }",
    "}",
    "",
    "if ($Mode -eq 'Update') {",
    "  if (-not (Test-Path $AppMain) -and -not (Test-Path $PythonExe)) {",
    "    Write-UpdateLog 'Aun no hay instalacion; se omite esta pasada.'",
    "    exit 0",
    "  }",
    "  if (Test-CrawlBusy) {",
    "    Write-UpdateLog 'Hay un escaneo en curso; no se actualiza para no cortar ni tocar SQLite. Se reintenta en la proxima pasada.'",
    "    exit 0",
    "  }",
    "  $remote = Get-RemoteRuntime",
    "  $local = ''",
    "  if (Test-Path $VersionFile) { $local = (Get-Content $VersionFile -Raw).Trim() }",
    "  if ($local -and $local -eq $remote.Version -and $remote.Version -ne 'main') {",
    "    Write-UpdateLog ('Ya esta en ' + $local + '; se comprueba que el motor este arriba.')",
    "    try { Start-EngineOrThrow | Out-Null } catch { Write-UpdateLog $_.Exception.Message; exit 1 }",
    "    exit 0",
    "  }",
    "  Stop-RuntimeSafe",
    "  try {",
    "    Install-RuntimeFiles -ZipUrl $remote.Zip",
    "  } catch {",
    "    Write-UpdateLog ('Fallo la descarga; se vuelve a levantar el motor actual. ' + $_.Exception.Message)",
    "    try { Start-EngineOrThrow | Out-Null } catch {}",
    "    exit 1",
    "  }",
    "  $health = Start-EngineOrThrow",
    "  Set-Content -Path $VersionFile -Value $remote.Version -Encoding ASCII",
    "  try { Copy-Item -Path $ScriptPath -Destination $UpdaterFile -Force } catch {}",
    "  Write-UpdateLog ('Actualizado a ' + $remote.Version + '. Historial en C:\\seo-runtime\\data intacto.')",
    "  exit 0",
    "}",
    "",
    "Install-RuntimeSource",
    "if (-not (Test-Path $AppMain)) { throw 'No se encontro apps\\runtime tras descargar el motor.' }",
    "$health = Start-EngineOrThrow",
    "try { Open-LanFirewall } catch { Write-Host 'No se abrio el firewall (hace falta administrador solo si otro PC de la oficina va a escanear). En ESTE PC el motor igual funciona.' }",
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
    "Write-Host 'El motor se arranca al iniciar sesion y se actualiza de madrugada. No expongas el 8080 a internet.'",
    "Write-Host 'Vuelve a la web y pulsa Ya esta listo.'",
    "Invoke-Pause",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function buildInstallerCmd(input: InstallerInput): string {
  return `${installerCmdHeader()}\r\n${PS_MARKER}\r\n${buildClientInstaller(input)}`;
}

export const INSTALLER_RUNTIME_VERSION = "0.2.0";

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
