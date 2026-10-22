# Cloudflare: D1, Access y deploy

Esta guía es para el dueño de la app. El repositorio no crea recursos reales ni guarda el email, el token ni el AUD definitivo.

Hay un solo Worker, `rutina`. El build de Vite (`dist/`) sale de Static Assets. Solo `/api/*` entra a Hono (`run_worker_first`). No se usa Cloudflare Pages.

## 1. Dos bases D1

Desde `worker/`, con Wrangler autenticado:

```sh
npx wrangler d1 create rutina-db --location weur
npx wrangler d1 create rutina-db-preview --location weur
```

`weur` es Europa occidental. Si el comando lista otras regiones, elegí la más cercana al uso real: el hint se fija al crear la base.

Copiá cada `database_id` sobre los placeholders de `worker/wrangler.toml` (`rutina-db` en la raíz y `rutina-db-preview` en `[env.preview]`). No commitees un id que no sea el de estas bases.

Aplicar migraciones, cuando el id ya esté en el archivo:

```sh
npx wrangler d1 migrations apply rutina-db --remote --env=""
npx wrangler d1 migrations apply rutina-db-preview --remote --env preview
```

`0001_init.sql` crea el esquema. No se editan migraciones ya aplicadas: el cambio siguiente es un archivo nuevo.

## 2. Access con código de un solo uso

En Zero Trust:

1. El equipo (`https://<equipo>.cloudflareaccess.com`) tiene que permitir solo One-time PIN. Desactivá otros métodos de login.
2. Creá una aplicación self-hosted antes de publicar el Worker. Hostnames:
   - `rutina.<subdominio>.workers.dev`
   - `rutina-preview.<subdominio>.workers.dev`
3. Duración de sesión: 720 horas.
4. Política Allow: un único email, el del dueño. No la escribas en el repo.
5. Service Auth: un token `ci-smoke` para el chequeo del deploy.
6. Copiá el AUD tag de la aplicación al valor `ACCESS_AUD` de producción y, si el preview tiene otra aplicación, al de `[env.preview]`. `ACCESS_TEAM_DOMAIN` es la URL del equipo, con `https://` y sin barra final.

Secretos, por ambiente. Wrangler los pide por stdin y no quedan en el archivo:

```sh
npx wrangler secret put OWNER_EMAIL
npx wrangler secret put ACCESS_SERVICE_CLIENT_IDS
npx wrangler secret put OWNER_EMAIL --env preview
npx wrangler secret put ACCESS_SERVICE_CLIENT_IDS --env preview
```

`ACCESS_SERVICE_CLIENT_IDS` es la lista de `common_name` separada por comas. Hoy alcanza con el id de `ci-smoke`.

`DEV_BYPASS_ACCESS` no se define en producción. Solo existe en `worker/.dev.vars` (está en `.gitignore`) y en `wrangler.test.toml`.

Salir de la sesión: `https://<hostname>/cdn-cgi/access/logout`. En localhost el enlace no se muestra porque no hay Access.

## 3. Secretos de GitHub

En el repositorio:

- `CLOUDFLARE_API_TOKEN`: permiso de Workers y D1 sobre esta cuenta.
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET`: el token `ci-smoke`.
- Variables `PRODUCTION_APP_URL` y `PREVIEW_APP_URL`: las URLs `https://` de cada hostname, sin barra final.

El workflow `deploy` no corre hasta que existan las variables `PREVIEW_APP_URL` y `PRODUCTION_APP_URL`. Cuando están, migra, compila el front con Vite y publica. Si el chequeo de Access falla en `main`, ejecuta `wrangler rollback`.

## 4. Primer deploy manual

Con `database_id`, AUD y secretos ya cargados:

```sh
npm ci
npm run build
cd worker && npm ci
npx wrangler d1 migrations apply rutina-db --remote --env=""
npx wrangler deploy --env=""
```

`--env=""` apunta al Worker de la raíz. Sin eso, Wrangler pide un ambiente porque el archivo también declara `preview`.

Preview:

```sh
npx wrangler d1 migrations apply rutina-db-preview --remote --env preview
npx wrangler deploy --env preview
```

Comprobación: sin cookie, `/` y `/api/health` responden 302 hacia `*.cloudflareaccess.com`. Con el token de servicio, `/api/health` responde 200 y `/` devuelve el HTML. El script `scripts/access-smoke.mjs` hace esas dos pruebas.

## 5. Datos

La app es solo web. Los entrenamientos viven en D1. No hay cliente nativo ni sincronización. El respaldo semanal exporta esa base.
