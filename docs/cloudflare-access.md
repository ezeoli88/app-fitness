# Cloudflare: D1, Access y deploy

Esta guía es para el dueño de la app. El email, el token y el AUD no se guardan en el repositorio.

Hay un solo Worker, `rutina`, en https://rutina.ekiolivier.workers.dev. El build de Vite (`dist/`) sale de Static Assets. Solo `/api/*` entra a Hono (`run_worker_first`). No se usa Cloudflare Pages. Hay un solo entorno, el de producción.

## 1. La base D1

`rutina-db` ya está creada en `weur` (Europa occidental). Su `database_id` está en `worker/wrangler.toml`. La migración `0001_init.sql` ya está aplicada.

El cambio de esquema siguiente es un archivo nuevo en `worker/migrations/`. `0001_init.sql` queda como está.

Para aplicar migraciones nuevas, desde `worker/`, con Wrangler autenticado:

```sh
npx wrangler d1 migrations apply rutina-db --remote
```

## 2. Access con código de un solo uso

Zero Trust todavía se está activando. En `worker/wrangler.toml`, `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` son placeholders (`https://pending.cloudflareaccess.com` y `pending-access-aud`). Reemplazalos cuando el equipo exista, antes de publicar.

En Zero Trust:

1. El equipo (`https://<equipo>.cloudflareaccess.com`) tiene que permitir solo One-time PIN. Desactivá otros métodos de login.
2. Creá una aplicación self-hosted antes de publicar el Worker. Hostname: `rutina.ekiolivier.workers.dev`.
3. Duración de sesión: 720 horas.
4. Política Allow: un único email, el del dueño. No la escribas en el repo.
5. Service Auth: un token `ci-smoke` para el chequeo del deploy.
6. Copiá el AUD tag de la aplicación a `ACCESS_AUD`. `ACCESS_TEAM_DOMAIN` es la URL del equipo, con `https://` y sin barra final.

Secretos. Wrangler los pide por stdin y no quedan en el archivo:

```sh
npx wrangler secret put OWNER_EMAIL
npx wrangler secret put ACCESS_SERVICE_CLIENT_IDS
```

`ACCESS_SERVICE_CLIENT_IDS` es la lista de `common_name` separada por comas. Hoy alcanza con el id de `ci-smoke`.

`DEV_BYPASS_ACCESS` no se define en producción. Solo existe en `worker/.dev.vars` (está en `.gitignore`) y en `wrangler.test.toml`.

Salir de la sesión: `https://rutina.ekiolivier.workers.dev/cdn-cgi/access/logout`. En localhost el enlace no se muestra porque no hay Access.

## 3. Secretos de GitHub

En el repositorio:

- `CLOUDFLARE_API_TOKEN`: permiso de Workers y D1 sobre esta cuenta.
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET`: el token `ci-smoke`.

La URL de la app es `https://rutina.ekiolivier.workers.dev`. El workflow `deploy` corre al hacer push a `main`. Si `ACCESS_TEAM_DOMAIN` o `ACCESS_AUD` siguen en placeholder, el job se detiene antes de tocar Cloudflare. Con esos valores ya reemplazados, migra, compila el front con Vite y publica. Si el chequeo de Access falla, ejecuta `wrangler rollback --message "El chequeo de Access falló"`. En GitHub Actions ese comando no pregunta: toma el mensaje y confirma el retorno a la versión estable anterior.

## 4. Primer deploy manual

Con el AUD y los secretos ya cargados:

```sh
npm ci
npm run build
cd worker && npm ci
npx wrangler d1 migrations apply rutina-db --remote
npx wrangler deploy
```

`0001_init.sql` ya está aplicada; el apply vuelve a correr sin cambiar esa migración. `wrangler deploy` publica el Worker de la raíz en https://rutina.ekiolivier.workers.dev.

Comprobación: sin cookie, `/` y `/api/health` responden 302 hacia `*.cloudflareaccess.com`. Con el token de servicio, `/api/health` responde 200 y `/` devuelve el HTML. El script `scripts/access-smoke.mjs` hace esas dos pruebas.

## 5. Datos

La app es solo web. Los entrenamientos viven en D1. No hay cliente nativo ni sincronización. El respaldo semanal exporta esa base.
