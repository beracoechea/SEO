# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
El versionado sigue [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

- Tarjetas de auditoría (críticos, avisos, OK, sitemap, ms, titles repetidos, 200/3xx/4xx/5xx) como filtro del listado de URLs, con texto de “qué significa” y el hallazgo en cada URL.
- Listado de URLs con carga al bajar (no se pintan miles de filas de golpe).
- Burbuja de cupo sitios usados/permitidos y banner de escaneo en progreso (llenado tipo agua) en la home de la org.
- Botones de volver más visibles e interruptor ES/EN con el idioma activo resaltado.
- Exportar informe Excel (resumen, gráficos HTTP/hallazgos y listado de URLs con saltos, destino, status y hallazgos).
- Mapa de indexación: `X-Robots-Tag` + meta robots, sitemap vs crawl, huérfanas, sitemap en 404, sitemap bloqueado por robots.txt, noindex en el XML, URLs fuera del sitemap.
- Diff entre escaneos: 404 nuevos/recuperados, noindex nuevo, titles cambiados, URLs añadidas o que ya no se piden.
- Cáscara web: login Google, i18n es/en, orgs, sitios, equipo, ajustes de runtime.
- Consola web de administración (`/admin`): todas las orgs, usuarios, cupos de sitios/páginas, conceder o restringir accesos.
- Este monitor usa Firestore **named database `webs`** en el proyecto Blaze compartido. Auth es el mismo; `(default)` no se toca.
- Paleta de producto (fondo `#f8fafc`/`#fff`, primario `#0f172a`/`#1E3a8a`, acentos esmeralda/cielo, estados ámbar y carmesí) y anillos/barras de auditoría.
- Guía de instalación (desarrollo + Docker en el cliente) y tester automático (`scripts/verify.ps1`, hook de `git push`, GitHub Actions).
- Runtime: crawl on-demand del sitio (BFS + sitemap, tope de la org), JWT, SQLite. Un escaneo a la vez, progreso en % y historial en la tarjeta. La web en desarrollo arranca el motor sola y el usuario solo pulsa Escanear.
- Firestore rules y guía de versiones / producción.

### Changed

- Las etiquetas HTTP en la UI hablan en claro (páginas OK, redirecciones, página no encontrada, error del servidor) en lugar de solo 200/3xx/4xx/5xx.
- El noindex considera meta robots y la cabecera `X-Robots-Tag`. El sitemap del listado cruza locs del XML con lo rastreado (incluye bloqueadas por robots.txt, sin pedirlas).

## [0.1.0] — 2026-08-20

### Added

- Repositorio inicial, README y flujo de GitHub (`main`).
