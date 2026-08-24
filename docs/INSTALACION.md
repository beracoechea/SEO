# Cómo correr el proyecto y cómo instalarlo en un cliente

Este archivo es la guía operativa. Si un paso no está aquí, no se improvisa.

Hay **dos piezas**. No se instalan igual:

| Pieza | Quién la corre | Dónde | Para qué |
|---|---|---|---|
| Cáscara web (`apps/web`) | Logicbus (nosotros) | HTTPS (local o Firebase Hosting) | Login Google, orgs, sitios, equipo, **administración** |
| Runtime (`apps/runtime`) | Cada cliente, en su red | Python embebido en un PC de planta (`C:\seo-runtime`) | Crawler, historial SQLite. **Los crawls no salen de su LAN** |

El cliente **no** publica la web. El cliente **sí** levanta el runtime con el instalador de `/admin` (doble clic; no hace falta Docker ni BIOS). En desarrollo la cáscara arranca el motor sola; no hay pantalla de Ajustes.

Repositorio: https://github.com/beracoechea/SEO

Ficha para ventas y personas no técnicas: **[PARA_MARKETING.txt](PARA_MARKETING.txt)**.

---

## 0. Qué tienes que tener instalado

### En tu máquina de desarrollo (Logicbus)

- Git
- Node.js 22 LTS (o 20+)
- Python 3.12 (para desarrollo; el cliente no lo instala a mano)
- Cuenta Google y un proyecto Firebase (Auth Google + Firestore)

### En el PC/servidor del cliente

- Windows 10/11
- Red LAN estable; el puerto **8080** abierto **solo en la red interna** si otro PC va a escanear (en el mismo equipo no hace falta)
- Un Google Workspace / Gmail con el que van a entrar a la cáscara
- Internet la primera vez (el instalador baja Python y Chromium)

No hace falta Node, ni instalar Python o Docker a mano. El ZIP de `/admin` lo hace.

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

Los **clientes no se dan de alta solos**. Cualquiera puede entrar con Google, pero la organización la crea un operador en `/admin` → Clientes (o Demostraciones) y luego invita el Gmail en Equipo.

Cáscara en producción (sitio Hosting propio, no pisa clima-laboral): **https://bgx-seo-monitor.web.app**  
En Authentication → Settings → Authorized domains agrega `bgx-seo-monitor.web.app` si Google rechaza el popup.

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
playwright install chromium
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

### 1.5 Runtime con Docker (solo Logicbus, opcional)

Desde la **raíz** del repo, si quieres probar el motor en un contenedor:

```powershell
copy apps\runtime\.env.example apps\runtime\.env
# edita apps\runtime\.env (ORG_ID, FIREBASE_PROJECT_ID, CORS_ORIGIN)

docker compose up -d --build
```

Health: http://127.0.0.1:8080/api/health  
Parar: `docker compose down` (el volumen `runtime-data` se conserva). El **cliente no usa este camino**.

### 1.6 Primer escaneo (salud técnica)

En **Sitios**, pulsa **Escanear** en la tarjeta. El motor pide de verdad esa web: home, `robots.txt`, sitemap (cuenta y URLs) y sigue enlaces internos del mismo host hasta el tope de la org (por defecto 20 000 URLs, varias peticiones en paralelo). Title, H1, meta, canonical, ALT, tiempos y score salen de esas respuestas, no de un stub.

Si el sitio está detrás de Cloudflare, el runtime usa un cliente que suele pasar el challenge; un corte de conexión no tira el escaneo entero. Sitios SPA (React, Next, Vue) se re-piden con Chromium cuando el HTML llega vacío. Solo corre **un** crawl a la vez. Los demás sitios quedan en la **cola** (Sitios): se pueden subir, bajar, sacar o **ejecutar ahora** (corta el que corre y el interrumpido pasa al siguiente puesto). Escanear se apaga si ese sitio ya está en cola. En cada sitio puedes programar escaneo automático (diario, cada 3 días, semanal o mensual); el PC del runtime tiene que seguir encendido. Un sitio grande (p. ej. ~14 000 URLs) tarda del orden de **decenas de minutos**, no una jornada. Con render JS en **siempre**, espera más.

El historial queda en SQLite local. No es Core Web Vitals de laboratorio.

En **Agregar/Editar sitio** está **Escaneo automático** y **Páginas con JavaScript** (automático por defecto: Chromium solo si el HTML llega vacío o hay un challenge). Si al abrir Sitios ves 404 en `/api/schedule` o 409 al encolar, el motor de 8080 es una versión vieja: `npm run dev` lo detecta (falta cola o render JS) y lo reinicia; o para el proceso de 8080 y vuelve a arrancar.

### 1.7 Demostraciones (operador de plataforma)

En `/admin` → **Demostraciones** el operador crea orgs propias (no son un cliente). Ahí registra un `https://` de un prospecto, lo escanea y en la auditoría descarga el informe: botón verde **Excel** (listado completo) y botón rojo **PDF** (resumen para la propuesta). Los **Clientes** siguen en la pestaña de organizaciones (cupos y usuarios). Cómo hablar del servicio: [PARA_MARKETING.txt](PARA_MARKETING.txt).

---

## 2. Instalar el runtime en un cliente

Esto es lo que se hace en el PC de planta. Logicbus ya tiene la cáscara en HTTPS y la org creada. **El cliente no edita `.env` ni clona el repo ni toca la BIOS.** El instalador sale de `/admin` de esa org.

### 2.1 Lo que Logicbus hace en `/admin`

1. Abre **Clientes** → la organización.
2. En **Motor en la planta**, confirma la **URL pública de la cáscara** (HTTPS de Hosting, no localhost).
3. **Descargar instalador**. Baja `Instalar-SEO-….zip` (Windows bloquea el `.cmd` suelto). Extrae y usa el `.cmd` de dentro, con el `ORG_ID` ya puesto.
4. Ese ZIP se lleva al PC de planta (USB, correo interno o AnyDesk).

### 2.2 En el PC del cliente

1. Extrae el ZIP. **Doble clic** en el `.cmd`. Si Control inteligente de aplicaciones lo bloquea: clic derecho → **Propiedades** → **Desbloquear**. Si SmartScreen dice “Windows protegió tu PC”, **Más información** → **Ejecutar de todas formas**.
2. La primera vez baja Python (en `C:\seo-runtime\python`) y Chromium. Tarda varios minutos. No hace falta Docker ni virtualización.
3. Al terminar imprime `http://127.0.0.1:8080/api/health`.
4. En la cáscara, en este mismo PC, pulsa **Ya está listo**. Ese botón también **vuelve a arrancar el motor** si lo cerraste (Windows puede pedir permiso una vez: Abrir Logicbus SEO). No hace falta pegar una URL LAN si escaneas desde esta máquina.

No hace falta Git ni Node ni instalar Python o Docker a mano. El firewall se intenta abrir en perfil **privado**, puerto 8080; si no hay permisos, en este mismo PC el motor igual funciona.

Si el script no puede bajar GitHub (repo privado o sin internet), Logicbus deja el tag descomprimido en `C:\seo-runtime` y vuelve a ejecutar el mismo `.cmd` (detecta `apps\runtime`, escribe `.env` e instala Python).

### 2.3 Actualizar el runtime del cliente

El instalador de `/admin` deja en `C:\seo-runtime\actualizar.ps1` y dos tareas de Windows: **Logicbus SEO runtime** (al iniciar sesión y cada 2 minutos si el motor se cayó; corre **sin ventana**) y **Logicbus SEO runtime update** (cada día a las 03:20). También registra `logicbus-seo://start` para que **Ya está listo** arranque el motor desde la web si lo cerraste. El usuario no tiene que dejar abierta una consola de Python.

1. Si hay un crawl en curso, **no toca nada** (reintenta la próxima vez).
2. Pregunta a GitHub si hay un tag más nuevo; si no, solo comprueba que el motor esté arriba.
3. Detiene uvicorn (el runtime vacía el WAL de SQLite al apagar).
4. Copia el código nuevo **sin pisar** `apps\runtime\.env` ni `C:\seo-runtime\data`.
5. `pip install` + arranque de uvicorn — el historial SQLite **no se borra**.

A mano (misma regla):

```powershell
cd C:\seo-runtime
powershell -ExecutionPolicy Bypass -File .\actualizar.ps1 -Mode Update
```

**Nunca** borres `C:\seo-runtime\data`: ahí está el historial.

### 2.4 Qué no hacer en el cliente

- No corras `npm run dev` ni Firebase Hosting ahí.
- No expongas el puerto 8080 a internet.
- No copies el `.ps1` a un chat público (lleva el ID de la org).
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
3. `/admin` (con `platformAdmins`) lista **Clientes**. En **Demostraciones** crea una org tuya, agrega un `https://` de prospecto, **Escanear** y descarga Excel (verde) y PDF (rojo). Restringir un usuario de un cliente y confirmar que ya no entra.
4. Abrir la org: Sitios → **Escanear** en un origin. El anillo y la tabla se llenan con URLs reales (títulos distintos por página).
5. `/admin` → cliente → **Descargar instalador**, extrae el ZIP, doble clic en el `.cmd`, esperar health y pulsar **Ya está listo**.
6. No hay `.env` en el commit (`git status`).

Detalle de tags y Firebase Hosting: [VERSIONES_GITHUB.md](VERSIONES_GITHUB.md).

---

## 4. Mapa rápido de comandos

| Objetivo | Comando |
|---|---|
| Web en local | `cd apps\web` → `npm run dev` |
| Tests web | `cd apps\web` → `npm test` |
| Runtime local | `cd apps\runtime` → `uvicorn app.main:app --port 8080` |
| Runtime Docker (solo Logicbus) | `docker compose up -d --build` |
| Runtime en cliente | `/admin` → Descargar instalador (Python en `C:\seo-runtime`) |
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
| Runtime unreachable | Motor en marcha (`http://127.0.0.1:8080/api/health`), IP LAN, firewall, `CORS_ORIGIN` = origen de la cáscara |
| `ERR_CONNECTION_REFUSED` a `127.0.0.1:8080` | El motor no está en este PC. Deja terminar el `.cmd` y pulsa **Ya está listo** (si ya estaba instalado y lo cerraste, el botón lo levanta). Si Windows no pregunta “Abrir Logicbus SEO”, vuelve a correr el instalador una vez. |
| El instalador pide virtualización / Docker | Versión vieja del ZIP. Vuelve a **Descargar instalador** desde `/admin` (el motor ya no usa Docker). |
| Puerto 8080 ocupado | Cierra Docker Desktop u otro programa en 8080 y reintenta el `.cmd` |
| Sitio SPA sin titles | En el sitio, **Páginas con JavaScript** en Automático o Siempre; `playwright install chromium` en el venv |
| Tras actualizar se perdió el historial | Se borró `C:\seo-runtime\data`. No lo hagas; ahí está el SQLite |
| Push rechazado | `.\scripts\verify.ps1` en rojo; lee el `FAIL` |
