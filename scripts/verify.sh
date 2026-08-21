#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Verificador del Monitor técnico (repo: $ROOT)"
echo "Si esto falla, no hagas push ni firebase deploy."

echo
echo "==> Contrato"
node "$ROOT/scripts/contract.mjs"

echo
echo "==> Tests web (Vitest)"
cd "$ROOT/apps/web"
if [ ! -d node_modules ]; then npm install; fi
npx vitest run

echo
echo "==> Build de producción de la cáscara"
npm run build

echo
echo "==> Tests runtime (pytest /health)"
cd "$ROOT/apps/runtime"
python -m pip install -q -r requirements-dev.txt
python -m pytest -q

if [ "${VERIFY_E2E:-}" = "1" ]; then
  echo
  echo "==> E2E (Playwright)"
  cd "$ROOT/apps/web"
  npx playwright install chromium
  npx playwright test
else
  echo
  echo "E2E omitido (VERIFY_E2E=1 para Playwright). CI sí lo corre."
fi

echo
echo "Todo verde. Puedes commitear / pushear / publicar."
