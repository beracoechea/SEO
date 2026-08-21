# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
El versionado sigue [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

- Cáscara web: login Google, i18n es/en, orgs, sitios, equipo, ajustes de runtime.
- Consola web de administración (`/admin`): todas las orgs, usuarios, cupos de sitios/páginas, conceder o restringir accesos.
- Este monitor usa Firestore **named database `webs`** en el proyecto Blaze compartido. Auth es el mismo; `(default)` no se toca.
- Paleta de producto (fondo `#f8fafc`/`#fff`, primario `#0f172a`/`#1E3a8a`, acentos esmeralda/cielo, estados ámbar y carmesí) y anillos/barras de auditoría.
- Guía de instalación (desarrollo + Docker en el cliente) y tester automático (`scripts/verify.ps1`, hook de `git push`, GitHub Actions).
- Runtime: crawl on-demand del sitio (BFS + sitemap, tope de la org), JWT, SQLite. Un escaneo a la vez, progreso en % y historial en la tarjeta. La web en desarrollo arranca el motor sola y el usuario solo pulsa Escanear.
- Firestore rules y guía de versiones / producción.

## [0.1.0] — 2026-08-20

### Added

- Repositorio inicial, README y flujo de GitHub (`main`).
