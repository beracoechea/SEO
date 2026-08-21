#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Step($Name, $Block) {
  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Block
  if (-not $?) {
    throw "Falló: $Name"
  }
}

Write-Host "Verificador del Monitor técnico (repo: $Root)"
Write-Host "Si esto falla, no hagas push ni firebase deploy."

Step "Contrato (rutas, i18n, rules, secretos)" {
  node "$Root\scripts\contract.mjs"
}

Step "Tests web (Vitest)" {
  Push-Location "$Root\apps\web"
  if (-not (Test-Path "node_modules")) { npm install }
  npx vitest run
  Pop-Location
}

Step "Build de producción de la cáscara" {
  Push-Location "$Root\apps\web"
  npm run build
  Pop-Location
}

Step "Tests runtime (pytest /health)" {
  Push-Location "$Root\apps\runtime"
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
  if (-not $py) { throw "Python no está en PATH" }
  & $py.Source -m pip install -q -r requirements-dev.txt
  & $py.Source -m pytest -q
  Pop-Location
}

if ($env:VERIFY_E2E -eq "1") {
  Step "E2E (Playwright, pantalla de login)" {
    Push-Location "$Root\apps\web"
    npx playwright install chromium
    npx playwright test
    Pop-Location
  }
} else {
  Write-Host ""
  Write-Host "E2E omitido (pon VERIFY_E2E=1 para Playwright). CI sí lo corre." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Todo verde. Puedes commitear / pushear / publicar." -ForegroundColor Green
