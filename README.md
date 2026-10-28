# Rutina

Aplicación web personal de entrenamiento. Los datos viven en Cloudflare D1, detrás de un Worker. El acceso lo resuelve Cloudflare Access. No hay registro, ni sesión propia, ni app nativa.

## Funciones

- Peso y repeticiones opcionales por serie. Admite coma o punto decimal, cero kg y campos vacíos. Copia los valores anteriores sin marcar las series.
- Finalización manual completa o parcial, descarte de sesiones vacías y cinco segundos para deshacer. Salir conserva el entrenamiento pendiente.
- Ejercicios opcionales por sesión: las series que faltan de un ejercicio marcado como opcional no dejan la sesión parcial.
- Rutinas editables, duplicación con historial independiente, archivo y orden de días y ejercicios. Quitar un ejercicio y agregar otro crea una identidad nueva.
- Las sesiones conservan sus nombres y objetivos originales aunque se edite la rutina.
- Próximo día sugerido, prioridad para la última sesión abierta utilizada, historial por páginas de 20, filtros y corrección de valores.
- Descanso automático de 90 segundos, configurable entre 15 y 600, con extensión, omisión y aviso en el navegador. Sin permiso se conserva el contador en la pestaña.
- Temas claro y oscuro. El tema y el temporizador activo quedan en este navegador. La rutina activa y la duración del descanso quedan en D1.

## Datos

La única fuente de datos es la API del Worker. El navegador no guarda el entrenamiento. Un respaldo semanal exporta la D1. El paso a paso de Access y del deploy está en [docs/cloudflare-access.md](docs/cloudflare-access.md).

## Web local

Requisito: Node 22.13 o posterior. El front es Vite + React. Las rutas usan TanStack Router, los datos TanStack Query y el editor TanStack Form. Instalar las dependencias con `npm ci` en la raíz y en `worker/`.

La web de desarrollo, en `http://127.0.0.1:8081`, proxea `/api` al Worker en `http://127.0.0.1:8787`. Ese proceso acepta el bypass de Access solo si el host es `localhost` o `127.0.0.1`. En cualquier otro host el bypass se ignora.

Si ya habías creado una D1 local con el esquema anterior, borrá `worker/.wrangler` antes de aplicar las migraciones.

```sh
cp worker/.dev.vars.example worker/.dev.vars
cd worker && npm ci
npx wrangler d1 migrations apply rutina-db --local
npx wrangler dev --port 8787 --ip 127.0.0.1
```

En otra terminal, desde la raíz: `npm run dev`. Abrí `http://127.0.0.1:8081`.

El build de producción no define `VITE_API_URL`: la app usa `/api` en el mismo origen. Para ver ese build:

```sh
npm run build
cd worker && npx wrangler dev --port 8787 --ip 127.0.0.1
```

Abrí `http://127.0.0.1:8787`.

## Cloudflare

Hay un solo entorno, el de producción. La D1 `rutina-db` está creada en `weur`, con `0001_init.sql` aplicada, y el Worker es [rutina.ezeo-cloud.workers.dev](https://rutina.ezeo-cloud.workers.dev). `ACCESS_TEAM_DOMAIN` es `https://ekiolivier.cloudflareaccess.com` y el AUD está en `worker/wrangler.toml`. El paso a paso está en [docs/cloudflare-access.md](docs/cloudflare-access.md).

## Verificación

```sh
npm test
npm run typecheck
npm run build
node scripts/check-web-bundle.mjs
cd worker && npm test && npm run typecheck && npx wrangler deploy --dry-run
git diff --check
```

`wrangler deploy --dry-run` necesita el `dist/` de Vite. No publica nada.

Las pruebas del Worker cubren el repositorio sobre D1, la siembra del catálogo, escrituras concurrentes y la paginación del historial. El navegador se prueba con Playwright (`npx playwright test --config e2e/playwright.config.ts`) contra ese build. El registro está en [docs/VALIDATION.md](docs/VALIDATION.md).
