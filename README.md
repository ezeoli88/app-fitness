# Rutina

Aplicación personal de entrenamiento. En Android guarda todo en SQLite y funciona sin red. En la web, el mismo código corre como un sitio estático detrás de un Worker de Cloudflare: la base es D1 y el acceso lo resuelve Cloudflare Access. No hay registro ni sesión propia.

## Funciones

- Peso y repeticiones opcionales por serie. Admite coma o punto decimal, cero kg y campos vacíos. Copia los valores anteriores sin marcar las series.
- Finalización manual completa o parcial, descarte de sesiones vacías y cinco segundos para deshacer. Salir conserva el entrenamiento pendiente.
- Rutinas editables, duplicación con historial independiente, archivo y orden de días y ejercicios. Quitar un ejercicio y agregar otro crea una identidad nueva.
- Las sesiones conservan sus nombres y objetivos originales aunque se edite la rutina.
- Próximo día sugerido, prioridad para la última sesión abierta utilizada, historial por páginas de 20, filtros y corrección de valores.
- Descanso automático de 90 segundos, configurable entre 15 y 600, con extensión, omisión y aviso local. Sin permiso se conserva el contador y la vibración en primer plano.
- Temas claro y oscuro.

## Ejecutar en Android

Requisitos: Node 22.13 o posterior (Node 24 para las pruebas con node:sqlite), JDK 17, Android SDK y un emulador abierto. Instalar las dependencias con `npm ci`.

```sh
npm run android
```

Este comando compila e instala la app nativa y levanta Metro. Expo Go no es necesario. Para reutilizar la instalación de desarrollo:

```sh
npx expo start --host lan --port 8081
adb reverse tcp:8081 tcp:8081
adb shell am start -n com.ezequiel.rutina/.MainActivity
```

Metro debe seguir abierto para usar el APK de desarrollo. Si aparece “Unable to load script”, comprobar que `http://127.0.0.1:8081/status` responda `packager-status:running`. En este equipo, `--host localhost` vinculaba el servidor solo a IPv6; `--host lan` permite la conexión del emulador.

Para una instalación que abra sin Metro:

```sh
npx expo run:android --variant release --no-bundler
```

En PowerShell, si npm/npx no están en PATH, usar `node node_modules/expo/bin/cli` en lugar de `npx expo`.

También se puede compilar el APK para un emulador x86_64, desde android:

```powershell
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=2
adb install -r app/build/outputs/apk/release/app-release.apk
```

El APK local usa la firma de desarrollo del proyecto; no está preparado para publicar en una tienda. Para un teléfono ARM hay que compilar la arquitectura correspondiente.

## Datos y recuperación

SQLite se almacena en `rutina.db` dentro del almacenamiento privado de la app. La migración a v5 agrega `uid` y `last_used_at` y conserva identificadores, fechas, preferencias y progreso. Antes de migrar una instalación existente se crea `rutina-antes-de-migrar-v5.db`. Si ya hay dos sesiones abiertas para el mismo día, la migración no crea el índice único para no dejar la instalación inutilizable. Si falla la migración, se ofrece reintentar y no se borra la base.

Las sesiones antiguas se reconstruyen con los objetivos disponibles al migrar; peso y repeticiones reales quedan sin dato. Se conservan las marcas de ejercicios retirados aunque su nombre u objetivo original ya no esté disponible.

Desinstalar elimina el almacenamiento local de Android. Para actualizar conservando datos, instalar con `adb install -r` y evitar desinstalar o borrar el almacenamiento. La copia previa a migrar también es local y no sustituye un respaldo externo.

## Web local

La web de desarrollo habla con un Worker en `http://127.0.0.1:8787`. Ese proceso acepta el bypass de Access solo si el host es `localhost` o `127.0.0.1`. En cualquier otro host el bypass se ignora.

```sh
cp worker/.dev.vars.example worker/.dev.vars
cd worker && npm ci
npx wrangler d1 migrations apply rutina-db --local
cd .. && npm run export:web
cd worker && npx wrangler dev --port 8787 --ip 127.0.0.1
```

Abrí `http://127.0.0.1:8787`. El export de producción no define `EXPO_PUBLIC_API_URL`: la app usa `/api` en el mismo origen. Para Metro (`npm run web`) apuntá el cliente al Worker:

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787/api npm run web
```

En ese caso el Worker responde CORS solo a `http://localhost:8081` y `http://127.0.0.1:8081`.

## Cloudflare

Todavía no hay una base ni un equipo de Access creados en esta rama. Los identificadores de `worker/wrangler.toml` son placeholders. El paso a paso para crear las dos D1, el equipo de Access, los secretos y el primer deploy está en [docs/cloudflare-access.md](docs/cloudflare-access.md).

La sincronización con Android queda para una fase posterior. Esta entrega no agrega endpoints de sync.

## Verificación

```sh
node node_modules/jest/bin/jest.js --runInBand --watchAll=false
node node_modules/typescript/bin/tsc --noEmit
npm run export:web
cd worker && npm test && npm run typecheck && npx wrangler deploy --dry-run --env=""
git diff --check
```

`wrangler deploy --dry-run` necesita el `dist/` del export y `--env=""` porque el archivo declara también el ambiente `preview`. No publica nada.

Las pruebas incluyen SQLite real mediante node:sqlite, migraciones y rollback, snapshots, escrituras concurrentes, paginación de más de 50 sesiones, sugerencias y reconciliación del temporizador con notificaciones simuladas.

El registro de pruebas automáticas y de los flujos comprobados en Android está en [docs/VALIDATION.md](docs/VALIDATION.md).

La entrega de avisos con la app cerrada o el teléfono bloqueado depende de los permisos y restricciones de Android. Verificar también en un dispositivo físico antes de distribuir.

Documentación: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [notificaciones](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
