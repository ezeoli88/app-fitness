# Validación de Rutina — 26 de septiembre de 2026

## Comprobaciones automáticas

- 37 pruebas, 9 suites, correctas con Jest.
- TypeScript: `tsc --noEmit`, correcto.
- `git diff --check`, correcto.
- Android: `assembleRelease` para x86_64, correcto. APK instalado con `adb install -r`.

Se usa SQLite real en las pruebas de migración y repositorio. Se cubren instalaciones nuevas, v1 y v3, migración idempotente, rollback ante fallos, conservación de preferencias, snapshots, cierre parcial, reapertura sin pérdida, descarte, reemplazo de ejercicios, orden de pendientes, escrituras consecutivas y paginación de 61 sesiones.

El temporizador se prueba con notificaciones simuladas: permiso denegado, reinicio, extensiones consecutivas, cancelación por serie de origen, avisos huérfanos, restauración sin duplicados y vibración al vencer sin eliminar la notificación entregada.

## Emulador Android

Pixel 9 Pro XL, Android 17/API 37, x86_64. Se comprobó:

1. Crear y guardar una rutina de prueba desde el editor; agregar un segundo día.
2. Registrar `12,5` kg y 8 repeticiones con el teclado numérico. Salir y volver a abrir conserva los valores.
3. Marcar una serie y recibir el aviso local en segundo plano. Tocar el aviso abre la sesión correspondiente.
4. Finalizar con 1 de 3 series. El detalle muestra estado parcial, objetivos originales y las series pendientes sin dato.
5. Corregir el peso a 13.5 kg y comprobarlo al volver a abrir el detalle.
6. Obtener el Día 2 como siguiente sugerencia tras la sesión parcial, abrirlo y descartar esa sesión vacía.
7. Copiar los valores de la sesión anterior: aparecen 13.5 kg y 8 repeticiones y el contador permanece en 0 de 3 series.
8. Abrir la instalación release con Metro detenido, conservando rutina, historial y valores.
9. Revisar los temas claro y oscuro y el diseño a 360 × 640 puntos. Se restauró la resolución original del emulador.
10. Recibir un segundo aviso con la pantalla apagada: Android registró una nueva notificación mientras `mWakefulness=Asleep`.
11. Archivar la rutina de prueba QA y acceder a su historial mediante el filtro Todas. La rutina activa final es Principiantes; el descanso se restauró a 90 segundos.

La ventana de deshacer de cinco segundos se verificó mediante pruebas del repositorio; la captura automática de ese control en el emulador fue demasiado lenta para pulsarlo dentro del plazo. La prueba de permisos denegados está automatizada; en la validación nativa se habilitaron los avisos desde los ajustes de Android.

No se validó en iOS ni en un teléfono físico. La entrega de avisos sigue sujeta a los permisos y restricciones de Android.
