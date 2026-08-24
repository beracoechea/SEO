# Monitor técnico SEO

Herramienta de auditoría técnica de sitios (HTTP, on-page, diffs, incidentes).

- **Cáscara web (HTTPS):** login Google, organizaciones, equipo, lista de links, consola de administración. Firestore: base nombrada **`webs`** (el `(default)` es de la otra app del mismo proyecto Blaze).
- **Runtime (LAN):** crawler, SQLite, historial. Los crawls no se suben a Firebase. En `/admin` se descarga un instalador; en planta se actualiza solo (sin borrar SQLite).

## Cómo correrlo e instalarlo en un cliente

La guía completa (desarrollo, instalador en planta, y el **tester que bloquea un push roto**) está en:

**[docs/INSTALACION.md](docs/INSTALACION.md)**

Para explicar el producto a clientes o a marketing (sin jerga de instalación): **[docs/PARA_MARKETING.txt](docs/PARA_MARKETING.txt)**.

Versiones, tags y `firebase deploy`: **[docs/VERSIONES_GITHUB.md](docs/VERSIONES_GITHUB.md)**.

## Arranque mínimo (desarrollo)

```powershell
cd apps\web
npm install
npm run dev
```

Firebase: copia `apps/web/.env.example` → `apps/web/.env.local`.  
Tester antes de publicar: `.\scripts\verify.ps1`

## Repositorio

https://github.com/beracoechea/SEO

```
apps/web             SPA React + Vite
apps/runtime         FastAPI (Python; en planta sin Docker)
deploy/cliente       Compose opcional solo para Logicbus
scripts/verify.ps1   Tester local
.github/workflows    Tester en cada PR / push a main
```
