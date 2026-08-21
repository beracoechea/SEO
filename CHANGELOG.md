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
- Cáscara web: login Google, i18n es/en, orgs, sitios, equipo.
- Consola web de administración (`/admin`): todas las orgs, usuarios, cupos de sitios/páginas, conceder o restringir accesos.
- Este monitor usa Firestore **named database `webs`** en el proyecto Blaze compartido. Auth es el mismo; `(default)` no se toca.
- Paleta de producto (fondo `#f8fafc`/`#fff`, primario `#0f172a`/`#1E3a8a`, acentos esmeralda/cielo, estados ámbar y carmesí) y anillos/barras de auditoría.
- Guía de instalación (desarrollo + Docker en el cliente) y tester automático (`scripts/verify.ps1`, hook de `git push`, GitHub Actions).
- Runtime: crawl on-demand del sitio (BFS + sitemap, tope de la org), JWT, SQLite. Un escaneo a la vez, progreso y historial en la tarjeta. La web en desarrollo arranca el motor sola y el usuario solo pulsa Escanear.
- Firestore rules y guía de versiones / producción.
- Editar y eliminar sitios (origin, plantillas, exclusiones) desde la tarjeta o la ficha. Mientras ese sitio se escanea, editar y eliminar quedan bloqueados.
- Botón de consulta en el header con la colorimetría de los nodos (gris / verde / rojo / azul).
- Cola de escaneos visible: reordenar, cancelar y ejecutar ahora (corta el crawl en curso y lo deja el siguiente). El botón Escanear se apaga si el sitio ya está en cola.
- Escaneo programado por sitio (diario, cada 3 días, semanal o mensual) y cola FIFO en el runtime.
- Aviso cuando un escaneo se corta a medias (score parcial y cuántas URLs quedaron).
- Pestaña **Demostraciones** en `/admin` para orgs propias de prospectos (registrar un sitio, escanearlo y compartir el informe).
- Al cancelar un sitio en cola, el botón se desactiva y muestra carga para evitar doble clic.

### Changed

- Las etiquetas HTTP en la UI hablan en claro (páginas OK, redirecciones, página no encontrada, error del servidor) en lugar de solo 200/3xx/4xx/5xx.
- El noindex considera meta robots y la cabecera `X-Robots-Tag`. El sitemap del listado cruza locs del XML con lo rastreado (incluye bloqueadas por robots.txt, sin pedirlas).
- Sitios en la home como bloques en cuadrícula; cada tarjeta muestra nodos de tendencia (mejoró / empeoró / igual) por escaneo.
- Avatar del header con la foto de Google Auth.
- Burbuja de escaneo con oleaje continuo y tiempo estimado de fin. El anillo de progreso ya no muestra el porcentaje.
- El crawler reintenta 5xx transitorios, timeouts y cortes de conexión; un fallo de red ya no cuenta como 500 ni aborta el crawl entero. User-Agent más cercano a un navegador.
- Nodos de tendencia: 5 por sitio, con score al pasar el cursor.
- Firestore (`webs`) fuerza long polling para evitar 400 en el canal Listen.
- GitHub Actions: `checkout@v5`, `setup-node@v5` y `setup-python@v6` (runtime Node 24; Node 20 está deprecado en los runners).
- Caché local de Firestore y reintento breve si el DNS/red corta el canal Listen/Write.
- El crawl pide varias URLs en paralelo (~8–12/s) para sitios grandes (sitemap de miles de URLs).
- Sitios detrás de Cloudflare (challenge “Just a moment…”) se piden con un cliente que el WAF suele dejar pasar.
- Ya no se muestra el banner naranja de “un escaneo a la vez”; si un sitio está ocupado, Escanear en otro lo deja en cola.
- En desarrollo, si el motor de 8080 no tiene cola, Vite lo reinicia al arrancar `npm run dev`.

### Fixed

- El contrato de `verify` acepta `initializeFirestore` en la BD named `webs` (antes exigía `getFirestore` y fallaba el CI).
- Sitios con Cloudflare devolvían 1 URL (403 del challenge) y el score quedaba en “—” si el host cortaba la conexión a mitad del crawl.
- El E2E de Playwright en CI (botones ES/EN del login) usa el nombre accesible Español/English.

### Removed

- Pestaña y pantalla **Ajustes** de la organización. El motor de escaneo ya no se configura ahí; el cupo se ve en Sitios y el nombre/cupos se administran en `/admin`.
- Sparkline de línea roja en las tarjetas de sitio.
- Guardado de `photoUrl` en Firestore; la foto sale de Google Auth.
- El pie de Sitios que decía que el score no es Lighthouse ni Core Web Vitals.

## [0.1.0] — 2026-08-20

### Added

- Repositorio inicial, README y flujo de GitHub (`main`).
