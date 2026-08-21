# Cómo correr el proyecto y cómo instalarlo en un cliente

Este archivo es la guía operativa. Si un paso no está aquí, no se improvisa.

Hay **dos piezas**. No se instalan igual:

| Pieza | Quién la corre | Dónde | Para qué |
|---|---|---|---|
| Cáscara web (`apps/web`) | Logicbus (nosotros) | HTTPS (local o Firebase Hosting) | Login Google, orgs, sitios, equipo, **administración** |
| Runtime (`apps/runtime`) | Cada cliente, en su red | Docker en un PC/servidor de planta | Crawler, historial SQLite. **Los crawls no salen de su LAN** |

El cliente **no** publica la web. El cliente **sí** levanta el runtime con Docker en su LAN. En desarrollo la cáscara arranca el motor sola; no hay pantalla de Ajustes.

Repositorio: https://github.com/beracoechea/SEO

---

## 0. Qué tienes que tener instalado

### En tu máquina de desarrollo (Logicbus)

- Git
- Node.js 22 LTS (o 20+)
- Python 3.12
- Docker Desktop (para probar el runtime como el cliente)
- Cuenta Google y un proyecto Firebase (Auth Google + Firestore)

### En el PC/servidor del cliente

- Windows 10/11 o Linux
- **Docker Desktop** (Windows) o Docker Engine + Compose (Linux)
- Red LAN estable; el puerto **8080** abierto **solo en la red interna** (no a internet)
- Un Google Workspace / Gmail con el que van a entrar a la cáscara

No hace falta Node ni Python en la planta.

---

## 1. Correr el proyecto en desarrollo (tú)

### 1.1 Clonar

```powershell
cd $HOME\Desktop
git clone https://github.com/beracoechea/SEO.git
cd SEO
```

### 1.2 Firebase (proyecto Blaze existente + BD `webs`)

Este monitor **no** usa la base `(default)`. Esa queda para la otra app del mismo proyecto. Auth Google sí es compartido (mismo proyecto).

1. En [Firebase Console](https://console.firebase.google.com) abre el proyecto Blaze que ya tienes.
2. Authentication → Sign-in method → **Google** (si ya estaba, no lo toques).
3. Authentication → Settings → Authorized domains: `localhost` y el dominio de Hosting.
4. Usa la app web ya creada; copia las claves a **`apps/web/.env.local`**. Incluye `VITE_FIRESTORE_DATABASE=webs`. Reinicia `npm run dev` después de guardar.
5. Firestore → Create database (si aún no existe) con **Database ID `webs`** (modo producción). No escribas colecciones de este producto en `(default)`.
6. En la **raíz del repo** (`Desktop\SEO`, no `apps\web`). Si `firebase` no está en el PATH, usa `npx`:

```powershell
cd C:\Users\FranciscoBeracoechea\Desktop\SEO
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

`firebase.json` apunta las rules **solo** a `webs`. Así no se pisan las rules de la otra app.

7. Primer operador de `/admin`: Authentication → Users → copiar el **UID** de tu Google. En Firestore, selector de base **`webs`** → Start collection `platformAdmins` → **Document ID = ese UID** (no un ID automático). Campos: `email` (string) y `createdAt` (timestamp). No hace falta un campo llamado `platformAdmins`.

Si antes creaste orgs o `platformAdmins` en `(default)`, no van a aparecer aquí. Hay que crearlos de nuevo en `webs`.

### 1.3 Cáscara web + motor de escaneo

El usuario **no** configura el runtime. `npm run dev` arranca la web y, en el mismo comando, intenta levantar el motor en el puerto 8080. La UI habla con él por `/runtime` (proxy). El operador solo entra y pulsa **Escanear**.

```powershell
cd apps\web
npm install
npm run dev
```

La primera vez, el runtime necesita el venv:

```powershell
cd apps\runtime
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
```

En `.env` basta `FIREBASE_PROJECT_ID` (el mismo de Vite). `ORG_ID` es opcional.

Abre http://localhost:5173 → Google → Sitios → **Escanear** en cada web.

### 1.4 Runtime a mano (solo si el autoarranque falló)

```powershell
cd apps\runtime
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8080
```

Comprueba: http://localhost:8080/api/health debe devolver `"ok": true`.

### 1.5 Runtime con Docker (como el cliente)

Desde la **raíz** del repo:

```powershell
copy apps\runtime\.env.example apps\runtime\.env
# edita apps\runtime\.env (ORG_ID, FIREBASE_PROJECT_ID, CORS_ORIGIN)

docker compose up -d --build
```

Health: http://localhost:8080/api/health  
Parar: `docker compose down` (el volumen `runtime-data` se conserva; no borres los crawls).

### 1.6 Primer escaneo (salud técnica)

En **Sitios**, pulsa **Escanear** en la tarjeta. El motor pide de verdad esa web: home, `robots.txt`, sitemap (cuenta y URLs) y sigue enlaces internos del mismo host hasta el tope de la org (por defecto 20 000 URLs, varias peticiones en paralelo). Title, H1, meta, canonical, ALT, tiempos y score salen de esas respuestas, no de un stub.

Si el sitio está detrás de Cloudflare, el runtime usa un cliente que suele pasar el challenge; un corte de conexión no tira el escaneo entero. Solo corre **un** crawl a la vez. Los demás sitios quedan en la **cola** (Sitios): se pueden subir, bajar, sacar o **ejecutar ahora** (corta el que corre y el interrumpido pasa al siguiente puesto). Escanear se apaga si ese sitio ya está en cola. En cada sitio puedes programar escaneo automático (diario, cada 3 días, semanal o mensual); el PC/Docker del runtime tiene que seguir encendido. Un sitio grande (p. ej. ~14 000 URLs) tarda del orden de **decenas de minutos**, no una jornada.

El historial queda en SQLite local. No es Core Web Vitals de laboratorio.

En **Agregar/Editar sitio** está **Escaneo automático**. Si al abrir Sitios ves 404 en `/api/schedule` o 409 al encolar, el motor de 8080 es una versión vieja: `npm run dev` lo detecta y lo reinicia; o para el proceso de 8080 y vuelve a arrancar.

### 1.7 Demostraciones (operador de plataforma)

En `/admin` → **Demostraciones** el operador crea orgs propias (no son un cliente). Ahí registra un `https://` de un prospecto, lo escanea y exporta Excel para la propuesta. Los **Clientes** siguen en la pestaña de organizaciones (cupos y usuarios).

---

## 2. Instalar el runtime en un cliente (Docker)

Esto es lo que se hace en el PC de planta. Logicbus ya tiene la cáscara en HTTPS y la org creada.

### 2.1 Lo que Logicbus entrega

1. Acceso al repo (o un zip del **tag** `vX.Y.Z`, nunca de un `main` a medias).
2. El `ORG_ID` de esa empresa (el de Firestore, URL `/o/...`).
3. El `FIREBASE_PROJECT_ID` de **producción**.
4. La URL pública de la cáscara, por ejemplo `https://….web.app`.
5. Esta guía.

### 2.2 En el PC del cliente

1. Instalar [Docker Desktop](https://www.docker.com/products/docker-desktop/). Reiniciar si lo pide. Debe quedar **Running**.
2. Clonar el tag acordado (o descomprimir el zip en `C:\seo-runtime`):

```powershell
git clone --branch v0.1.0 --depth 1 https://github.com/beracoechea/SEO.git C:\seo-runtime
cd C:\seo-runtime
```

3. Crear el `.env` del paquete cliente:

```powershell
copy deploy\cliente\.env.example deploy\cliente\.env
notepad deploy\cliente\.env
```

Completar:

```
ORG_ID=...                    # el de la org en Firestore
FIREBASE_PROJECT_ID=...       # proyecto Firebase de producción
CORS_ORIGIN=https://TU-APP.web.app
RUNTIME_PORT=8080
RUNTIME_VERSION=0.1.0
```

`CORS_ORIGIN` **tiene** que ser el origen HTTPS de la cáscara. Si queda `localhost`, el navegador del usuario no podrá llamar al runtime.

4. Levantar:

```powershell
docker compose -f deploy\cliente\docker-compose.yml --env-file deploy\cliente\.env up -d --build
```

5. Probar en ese mismo PC: http://localhost:8080/api/health

6. Anotar la **IP LAN** del PC (`ipconfig` → IPv4, tipo `192.168.x.x`). Los demás usuarios usarán `http://192.168.x.x:8080`.

7. Firewall de Windows: permitir TCP 8080 **solo en red privada**, no en perfiles públicos ni en el router hacia WAN.

8. En la oficina, la cáscara debe alcanzar ese `http://192.168.x.x:8080` (misma LAN o VPN). En desarrollo local Vite arranca el motor y no hay que pegar ninguna URL. Si estás fuera de la red del cliente, el historial no estará (es el diseño).

### 2.3 Actualizar el runtime del cliente

```powershell
cd C:\seo-runtime
git fetch --tags
git checkout v0.1.1
docker compose -f deploy\cliente\docker-compose.yml --env-file deploy\cliente\.env up -d --build
```

El volumen Docker `runtime-data` **no se borra**. No ejecutes `docker compose down -v` salvo que quieras tirar el historial.

### 2.4 Qué no hacer en el cliente

- No corras `npm run dev` ni Firebase Hosting ahí.
- No expongas el puerto 8080 a internet.
- No copies `.env` a un chat ni al repo.
- No cambies `ORG_ID` a la org de otra empresa (el runtime queda atado a una sola).

---

## 3. Tester: validar que la app no se rompió **antes** de publicar

Nada de `git push` a `main`, tag, ni `firebase deploy` si el verificador está en rojo.

Eso cubre tres capas:

| Capa | Qué comprueba | Cuándo |
|---|---|---|
| Contrato (`scripts/contract.mjs`) | Rutas, i18n es=en, rules de admin, versiones iguales, que no se suban `.env` ni claves | Siempre |
| Unitarias | Orígenes privados bloqueados, `/api/health`, build de la cáscara | Siempre |
| E2E (Playwright) | La web **arranca** y se ve login + cambio de idioma | CI siempre; en tu PC con `VERIFY_E2E=1` |

Google Sign-In real, Firestore y un crawl completo **no** se pueden automatizar en CI sin secretos. Eso va en la checklist manual del final.

### 3.1 En tu PC (PowerShell), desde la raíz del repo

```powershell
.\scripts\verify.ps1
```

Con el navegador de prueba (más lento, la primera vez baja Chromium):

```powershell
$env:VERIFY_E2E = "1"
.\scripts\verify.ps1
```

Si algo falla, **no subas**. El script dice qué capa quebró.

### 3.2 Hook de Git: que `git push` no pase si está rojo

Una vez por clone:

```powershell
.\scripts\install-git-hooks.ps1
```

Eso copia `.githooks/pre-push` a `.git/hooks/pre-push`. A partir de ahí, cada `git push` corre `verify.ps1` (sin E2E, para que no tarde 2 minutos). Si el tester falla, el push se aborta y GitHub no cambia.

Para un push de docs triviales de emergencia (no es lo normal):

```powershell
git push --no-verify
```

Úsalo solo si sabes que no tocaste código.

### 3.3 GitHub Actions (el tester en la nube)

Cada **pull request** y cada **push a `main`** corre `.github/workflows/verify.yml`:

- contrato
- Vitest
- `npm run build`
- pytest del runtime
- Playwright (login visible)
- `docker compose config`

En GitHub: pestaña **Actions**. Si está rojo, no hagas merge ni deploy.

### 3.4 Checklist humana (piloto / producción)

Después de verde en Actions:

1. Login Google en la URL que vas a publicar.
2. Crear org, agregar un sitio `https://…`, invitar un segundo Gmail y confirmar que **ve el mismo origin**.
3. `/admin` (con `platformAdmins`) lista **Clientes**. En **Demostraciones** crea una org tuya, agrega un `https://` de prospecto, **Escanear** y exporta Excel. Restringir un usuario de un cliente y confirmar que ya no entra.
4. Abrir la org: Sitios → **Escanear** en un origin. El anillo y la tabla se llenan con URLs reales (títulos distintos por página).
5. No hay `.env` en el commit (`git status`).

Detalle de tags y Firebase Hosting: [VERSIONES_GITHUB.md](VERSIONES_GITHUB.md).

---

## 4. Mapa rápido de comandos

| Objetivo | Comando |
|---|---|
| Web en local | `cd apps\web` → `npm run dev` |
| Tests web | `cd apps\web` → `npm test` |
| Runtime local | `cd apps\runtime` → `uvicorn app.main:app --port 8080` |
| Runtime Docker (dev) | `docker compose up -d --build` |
| Runtime Docker (cliente) | ver sección 2 |
| Tester completo local | `.\scripts\verify.ps1` |
| Instalar freno de push | `.\scripts\install-git-hooks.ps1` |
| Publicar cáscara | solo con Actions verde; ver `docs/VERSIONES_GITHUB.md` |

---

## 5. Problemas frecuentes

| Síntoma | Qué mirar |
|---|---|
| Login pide claves de Firebase | Archivo en `apps/web/.env.local` (no solo en la raíz) y **reiniciar** `npm run dev` |
| Google cierra el popup | Authorized domains; el origen debe ser `localhost` o HTTPS |
| No aparece Administración | Falta `platformAdmins/{tuUid}` |
| Runtime unreachable | Docker Running, IP LAN, firewall, `CORS_ORIGIN` = origen de la cáscara |
| `docker compose` pide `.env` | Copiaste el example a `.env` y llenaste `ORG_ID` |
| Push rechazado | `.\scripts\verify.ps1` en rojo; lee el `FAIL` |
