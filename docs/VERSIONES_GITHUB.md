# Gestión de versiones en GitHub y push a producción

Este documento es la guía operativa del repo
https://github.com/beracoechea/SEO

Si no está escrito aquí, no se publica “de oído”.

---

## 1. Qué es “producción” en este producto

Hay **dos artefactos**, no uno:

| Artefacto | Dónde corre en producción | Qué contiene |
|-----------|---------------------------|--------------|
| Cáscara web (`apps/web`) | Firebase Hosting (HTTPS) | Login Google, orgs, equipo, links de sitios, consola `/admin` (clientes + demostraciones), export Excel/PDF |
| Runtime (`apps/runtime`) | Servidor / PC de cada empresa (LAN) | Crawler (HTTP + render JS), SQLite, historial |

- Publicar la web **no** despliega el crawler en las oficinas.
- Actualizar el runtime es el ZIP/instalador de `/admin` que cada org ejecuta (Python en `C:\seo-runtime`).
- Firebase Auth + Firestore son el control plane compartido (usuarios y links). El proyecto Firebase de **producción** no se mezcla con el de desarrollo.
- El historial del crawl no sube a Firebase.
- Ficha comercial (sin jerga de instalación): [PARA_MARKETING.txt](PARA_MARKETING.txt).

---

## 2. Ramas

Usamos **trunk-based** (simple, un equipo chico):

| Rama | Rol |
|------|-----|
| `main` | Código estable. Lo que está en `main` **puede** ir a producción. |
| `feat/...` `fix/...` | Trabajo en curso. Se fusiona a `main` con PR o merge local revisado. |

No usamos `develop` por ahora. No se hace commit directo a `main` de experimentos rotos.

Nombres de rama:

```
feat/login-google
feat/crawler-bfs
fix/firestore-rules
chore/version-0.2.0
```

---

## 3. Versionado (SemVer)

Formato: `MAJOR.MINOR.PATCH` — ejemplo `0.1.0`

| Parte | Cuándo subir |
|-------|----------------|
| PATCH (`0.1.1`) | Bugfix, copy, i18n, no rompe APIs ni Firestore. |
| MINOR (`0.2.0`) | Pantalla o extractor nuevo, compatible. |
| MAJOR (`1.0.0`) | Primer piloto estable, o cambio que rompe runtime vs cáscara. |

Mientras el producto no tenga clientes de pago, el MAJOR puede quedarse en `0.x`.

La versión vive en:

- `apps/web/package.json` → `"version"`
- `apps/runtime/app/__init__.py` → `__version__`
- Tag de Git: `v0.1.0` (siempre con prefijo `v`)

Las tres deben coincidir en cada release.

---

## 4. Changelog

Cada release actualiza `CHANGELOG.md` (Keep a Changelog):

- Added
- Changed
- Fixed

Se escribe **antes** del tag, en el mismo commit de bump de versión.

---

## 5. Flujo diario (no es producción)

```text
1. git checkout main
2. git pull origin main
3. git checkout -b feat/mi-cambio
4. Trabajar, commits pequeños en español o inglés, pero consistentes.
5. git push -u origin feat/mi-cambio   # el hook pre-push corre el tester si lo instalaste
6. Abrir Pull Request a main en GitHub. **No merges si Actions está rojo.**
7. Merge a main.
8. Borrar la rama remota.
```

Mensajes de commit (convención):

```
feat: login Google y onboarding de org
fix: CORS del runtime con el origen de Hosting
docs: versiones y despliegue
chore: bump 0.1.1
```

No se sube `.env`, claves de servicio Firebase, ni SQLite con datos de clientes.

---

## 6. Cómo se hace un release (GitHub)

En `main`, limpio, **Actions verde** y `.\scripts\verify.ps1` en local:

```bash
# 1. Actualizar versión en package.json y app/__init__.py
# 2. Anotar CHANGELOG.md

git add -A
git commit -m "chore: release v0.1.0"

git tag -a v0.1.0 -m "v0.1.0 — cáscara login y orgs"
git push origin main
git push origin v0.1.0
```

En GitHub → **Releases** → “Draft a new release” → elegir el tag `v0.1.0`.

Adjuntos típicos del runtime (cuando existan):

- `seo-runtime-0.1.0.zip` o imagen Docker `ghcr.io/beracoechea/seo-runtime:0.1.0`

La cáscara no se adjunta: se despliega a Hosting (sección 7).

---

## 7. Push a producción — cáscara web (Firebase Hosting)

Producción = canal **live** del sitio Hosting **`bgx-seo-monitor`** (URL: https://bgx-seo-monitor.web.app).  
**Nunca** hagas `firebase deploy --only hosting` contra el sitio por defecto `clima-laboral-e7698`: esa es la otra app.

### Primera vez (una sola)

```bash
npm install -g firebase-tools
firebase login
cd <repo>
firebase use --add    # elige el proyecto prod, alias: prod
```

`firebase.json` ya apunta a `apps/web/dist`.

### Cada vez que main está listo para usuarios reales

```bash
git checkout main
git pull origin main

cd apps/web
npm ci
npm run build

cd ../..
firebase use prod
firebase deploy --only hosting
```

Comprobar:

1. `https://<dominio-prod>` abre login.
2. Google Sign-In funciona (Authorized domain en Firebase Auth).
3. Firestore rules de la BD **`webs`**: `firebase deploy --only firestore:rules,firestore:indexes`  
   (no despliega `(default)`; esa BD es de la otra app).

Si la cáscara y las rules van juntas:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

**Preview (opcional, no es prod):**

```bash
firebase hosting:channel:deploy preview --expires 7d
```

Eso da una URL temporal para Marketing sin tocar live.

---

## 8. Push a producción — runtime (oficina del cliente)

El runtime **no** se publica en Firebase Hosting.

1. Tag `vX.Y.Z` hecho (sección 6).
2. Construir imagen o zip desde ese tag (nunca desde un working copy sucio):

   ```bash
   git checkout v0.1.0
   cd apps/runtime
   docker build -t seo-runtime:0.1.0 .
   ```

3. Entregar al operador / cliente: imagen o `docker compose` pinneado a `0.1.0`.
4. En el servidor LAN: `docker compose pull && docker compose up -d`.
5. En la cáscara (ajustes de org): URL del runtime (`http://host:8080`) y botón “Probar”.

Rollback: levantar el tag anterior (`v0.0.9`). SQLite es volumen persistente; no borrar `./data`.

---

## 9. Proyectos Firebase: dev vs prod

| Alias | Uso |
|-------|-----|
| `dev` | Empleados desarrollando. Auth de prueba. |
| `prod` | Usuarios reales (piloto y clientes). |

Nunca apuntes el `.env.local` de desarrollo al proyecto `prod` para “probar un rato”.

`apps/web/.env.production` (no se commitea secretos; las claves web de Firebase son públicas pero el **proyecto** sí importa).

---

## 10. Checklist antes de tocar producción

- [ ] `main` actualizado y **Actions verde** (workflow `Verificar antes de publicar`).
- [ ] `.\scripts\verify.ps1` pasó en local.
- [ ] CHANGELOG actualizado.
- [ ] Tag `vX.Y.Z` empujado.
- [ ] `firebase use prod` confirmado (no `dev`).
- [ ] Rules de Firestore revisadas (nadie lee orgs ajenas, salvo `platformAdmins`) y desplegadas a la BD **`webs`**, no a `(default)`.
- [ ] El primer operador existe en `platformAdmins/{uid}`.
- [ ] Runtime: `ORG_ID` del cliente no cambió por error.
- [ ] Aviso a Marketing/IT si hay migración o downtime.

---

## 11. Emergencias

- **Login roto en prod:** no hagas `firebase deploy` desde una rama feat. Revert:

  ```bash
  git checkout main
  git revert <sha>   # o re-deploy del tag anterior
  firebase use prod
  firebase deploy --only hosting
  ```

- **Rules demasiado abiertas:** desplegar rules del último tag conocido inmediatamente.

- **No usar** `git push --force` a `main` salvo recuperación acordada (reescribe historia pública).

---

## 12. Resumen en una frase

`main` + tag `vX.Y.Z` + `firebase deploy` (proyecto **prod**) = cáscara en producción.  
El crawler en planta **no** se publica con Hosting: el instalador deja una tarea de Windows (`actualizar.ps1`) que baja el tag nuevo, hace `compose stop` + `up --build` y **no** borra el volumen SQLite.
