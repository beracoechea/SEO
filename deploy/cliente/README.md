# Compose opcional (desarrollo)

El cliente **no** usa esta carpeta. El instalador de `/admin` deja Python embebido en `C:\seo-runtime` y arranca uvicorn. No instala Docker.

Este `docker-compose.yml` sirve para probar el runtime en un contenedor, igual que en desarrollo. Guía: [docs/INSTALACION.md](../../docs/INSTALACION.md) sección 1.5.

El historial del cliente vive en `C:\seo-runtime\data`. No borres esa carpeta.
