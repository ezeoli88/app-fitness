# Rutina

Aplicación web personal de entrenamiento. Los datos viven en Cloudflare D1, detrás de un Worker. El acceso lo resuelve Cloudflare Access. No hay registro, ni sesión propia, ni app nativa.

## Funciones

- Peso y repeticiones opcionales por serie. Admite coma o punto decimal, cero kg y campos vacíos. Copia los valores anteriores sin marcar las series.
- Finalización manual completa o parcial, descarte de sesiones vacías y cinco segundos para deshacer. Salir conserva el entrenamiento pendiente.
- Rutinas editables, duplicación con historial independiente, archivo y orden de días y ejercicios. Quitar un ejercicio y agregar otro crea una identidad nueva.
- Las sesiones conservan sus nombres y objetivos originales aunque se edite la rutina.
- Próximo día sugerido, prioridad para la última sesión abierta utilizada, historial por páginas de 20, filtros y corrección de valores.
- Descanso automático de 90 segundos, configurable entre 15 y 600, con extensión, omisión y aviso en el navegador. Sin permiso se conserva el contador en la pestaña.
- Temas claro y oscuro. El tema y el temporizador activo quedan en este navegador. La rutina activa y la duración del descanso quedan en D1.

## Datos

La única fuente de datos es la API del Worker. El navegador no guarda el entrenamiento. Un respaldo semanal exporta la D1. El paso a paso para crear las bases, Access y el deploy está en [docs/cloudflare-access.md](docs/cloudflare-access.md).

## Web local

Requisito: Node 22.13 o posterior. Instalar las dependencias con `npm ci` en la raíz y en `worker/`.

La web de desarrollo habla con un Worker en `http://127.0.0.1:8787`. Ese proceso acepta el bypass de Access solo si el host es `localhost` o `127.0.0.1`. En cualquier otro host el bypass se ignora.

Si ya habías creado una D1 local con el esquema anterior, borrá `worker/.wrangler` antes de aplicar las migraciones.

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

Todavía no hay una base ni un equipo de Access creados en esta rama. Los identificadores de `worker/wrangler.toml` son placeholders. El paso a paso está en [docs/cloudflare-access.md](docs/cloudflare-access.md).

## Verificación

```sh
node node_modules/jest/bin/jest.js --runInBand --watchAll=false
node node_modules/typescript/bin/tsc --noEmit
npm run export:web
cd worker && npm test && npm run typecheck && npx wrangler deploy --dry-run --env=""
git diff --check
```

`wrangler deploy --dry-run` necesita el `dist/` del export y `--env=""` porque el archivo declara también el ambiente `preview`. No publica nada.

Las pruebas del Worker cubren el repositorio sobre D1, la siembra del catálogo, escrituras concurrentes y la paginación del historial. El registro está en [docs/VALIDATION.md](docs/VALIDATION.md).

Documentación: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
