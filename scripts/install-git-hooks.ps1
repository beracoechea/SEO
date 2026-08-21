#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$HookDir = Join-Path $Root ".git\hooks"
$Src = Join-Path $Root ".githooks\pre-push"
$Dst = Join-Path $HookDir "pre-push"

if (-not (Test-Path (Join-Path $Root ".git"))) {
  throw "No hay carpeta .git. Corre esto desde un clone del repo."
}
New-Item -ItemType Directory -Force -Path $HookDir | Out-Null
Copy-Item -Force $Src $Dst
Write-Host "Hook pre-push instalado en .git/hooks/pre-push"
Write-Host "A partir de ahora, git push corre el verificador. Si falla, no sube nada."
