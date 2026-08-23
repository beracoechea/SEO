# Paquete Docker para el PC/servidor del cliente

No instales Node ni Python en la planta. El instalador de `/admin` instala **Docker Desktop** si falta.

El camino normal **no** es copiar este folder a mano:

1. En la cáscara: `/admin` → el cliente → **Descargar instalador**.
2. En el PC de planta: ejecutar el `.ps1` (administrador).
3. Pegar en `/admin` la URL LAN que imprime el script.

El mismo `.ps1` deja `C:\seo-runtime\actualizar.ps1` y una tarea de Windows: actualiza el motor en segundo plano **sin** `docker compose down -v` (el historial SQLite se conserva).

Detalle: [docs/INSTALACION.md](../../docs/INSTALACION.md) sección 2.
