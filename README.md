# Rutina

Aplicación personal de entrenamiento, local y sin cuentas. Expo SDK 57, React Native, Expo Router y SQLite. Android es la plataforma principal.

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

SQLite se almacena en `rutina.db` dentro del almacenamiento privado de la app. La migración a v4 conserva identificadores, fechas, preferencias y progreso. Antes de migrar una instalación existente se crea `rutina-antes-de-migrar-v4.db`. Si falla la migración, se ofrece reintentar y no se borra la base.

Las sesiones antiguas se reconstruyen con los objetivos disponibles al migrar; peso y repeticiones reales quedan sin dato. Se conservan las marcas de ejercicios retirados aunque su nombre u objetivo original ya no esté disponible.

Desinstalar elimina el almacenamiento local de Android. Para actualizar conservando datos, instalar con `adb install -r` y evitar desinstalar o borrar el almacenamiento. La copia previa a migrar también es local y no sustituye un respaldo externo.

## Verificación

```sh
node node_modules/jest/bin/jest.js --runInBand --watchAll=false
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Las pruebas incluyen SQLite real mediante node:sqlite, migraciones y rollback, snapshots, escrituras concurrentes, paginación de más de 50 sesiones, sugerencias y reconciliación del temporizador con notificaciones simuladas.

El registro de pruebas automáticas y de los flujos comprobados en Android está en [docs/VALIDATION.md](docs/VALIDATION.md).

La entrega de avisos con la app cerrada o el teléfono bloqueado depende de los permisos y restricciones de Android. Verificar también en un dispositivo físico antes de distribuir.

Documentación: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [notificaciones](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
