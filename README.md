# Monitor técnico SEO

Herramienta de auditoría técnica de sitios (HTTP, on-page, diffs, incidentes).

- **Cáscara web (HTTPS):** login Google, organizaciones, equipo, lista de links.
- **Runtime (LAN):** crawler, SQLite, historial. Los datos del crawl no se suben a Firebase.

Especificación: el brief y el manual técnico viven en `LogicbusPY` del escritorio; este repo es el código.

## Repositorio

https://github.com/beracoechea/SEO

## Cómo arrancar (desarrollo)

### 1. Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com).
2. Activa **Authentication → Google**.
3. Crea una app web y copia las claves a `apps/web/.env.local` (ver `.env.example`).
4. Activa **Firestore**.
5. En Authentication → Settings → Authorized domains: `localhost` y tu dominio de Hosting.

### 2. Cáscara web

```bash
cd apps/web
npm install
npm run dev
```

Abre `http://localhost:5173`.

### 3. Runtime (LAN)

```bash
cd apps/runtime
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8080
```

Health: `http://localhost:8080/api/health`

## Versiones y producción

Lee **[docs/VERSIONES_GITHUB.md](docs/VERSIONES_GITHUB.md)**. Ahí está cómo se tagea, cómo se hace push y cómo se publica la cáscara en producción.

## Estructura

```
apps/web        SPA React + Vite (Firebase Auth + Firestore)
apps/runtime    FastAPI + SQLite (crawler, JWT Firebase)
firebase/       reglas Firestore y firebase.json
docs/           versiones, despliegue
```
