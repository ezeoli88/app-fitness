# Dieta con Claude: conector MCP

La dieta no tiene IA propia. Le mandás la foto del plato a Claude (claude.ai, escritorio o la app del celular) y Claude la juzga contra tu objetivo y la anota en Rutina por el conector MCP. La app solo muestra el resultado en `/diet`. La foto no se guarda en ningún lado: solo el veredicto.

## Qué expone

El mismo Worker atiende `POST /mcp` (Streamable HTTP, sin sesión, respuestas JSON). Herramientas:

| Herramienta | Qué hace |
| --- | --- |
| `log_meal` | Anota un plato: `verdict` (`ok`, `a_bit_much`, `too_much`), `protein` (`enough`, `low`), `carbs` (`ok`, `high`) y una nota. |
| `delete_meal` | Borra un plato ("no lo comí"). |
| `log_waist` | Anota la cintura en cm. |
| `set_height` | Guarda la altura para el ratio cintura-altura. |
| `get_diet_summary` | Platos, conteo por semáforo, cintura y altura de los últimos días. |
| `get_recent_workouts` | Últimos entrenamientos con series, peso y repeticiones. |
| `save_lab_report` | Guarda un análisis de sangre con todos sus valores: clave estable (`glucose`, `hdl`, …), nombre, categoría, resultado, unidad y rango de referencia. |
| `delete_lab_report` | Borra un estudio con sus valores. |
| `get_lab_history` | Estudios guardados y la evolución de cada valor, con el cociente triglicéridos/HDL calculado. |

Los criterios del veredicto y el objetivo están en las instrucciones del servidor (`worker/src/mcp.ts`, `DIET_GOAL` en `src/domain/diet.ts`). Claude las lee al conectarse.

## Autenticación

claude.ai se conecta por OAuth 2.1. El Worker es su propio servidor de autorización (`@cloudflare/workers-oauth-provider`, tokens en el KV `OAUTH_KV`):

- `/register`, `/token`, `/.well-known/oauth-*` y `/mcp` tienen que quedar fuera de Access: los llama el servidor de Anthropic, que no tiene la cookie. `/mcp` igual exige un token válido.
- `/authorize` sigue detrás de Access. Ahí se ve la pantalla "¿Conectar Claude con Rutina?" y solo el dueño puede aprobarla.
- Solo se aceptan destinos `https://claude.ai`, `https://claude.com` y apps locales (`localhost`). Cualquier otro cliente se rechaza en `/authorize`.
- El token de acceso dura 1 hora y el de renovación 90 días.

## Configuración (una vez)

### 1. El KV de los tokens

`wrangler.toml` declara `OAUTH_KV` sin id: `wrangler deploy` lo crea solo la primera vez si el token de la API tiene permiso **Workers KV Storage: Edit**. Agregale ese permiso a `CLOUDFLARE_API_TOKEN` antes de mergear.

Si preferís crearlo a mano, desde `worker/`:

```sh
npx wrangler kv namespace create OAUTH_KV
```

y copiá el `id` que devuelve en el bloque `[[kv_namespaces]]` de `worker/wrangler.toml`.

### 2. Sacar de Access las rutas de OAuth

En Zero Trust → Access → Applications → Add an application → Self-hosted:

1. Nombre: `rutina-mcp`.
2. Destinos (todos con el hostname `rutina.ezeo-cloud.workers.dev`):
   - `/mcp`
   - `/token`
   - `/register`
   - `/.well-known/*`
3. Política: acción **Bypass**, incluir **Everyone**.

Access aplica la aplicación con la ruta más específica, así que estas rutas quedan abiertas y el resto del sitio, `/authorize` incluido, sigue con la política del dueño.

Comprobación: `curl -i https://rutina.ezeo-cloud.workers.dev/mcp -X POST` responde `401` con `WWW-Authenticate: Bearer ... resource_metadata=...` (no un `302` a Access).

### 3. Conectar Claude

En claude.ai: Configuración → Conectores → Agregar conector personalizado.

- Nombre: `Rutina`
- URL: `https://rutina.ezeo-cloud.workers.dev/mcp`

Al tocar Conectar se abre `/authorize`: si Access pide el código, ingresalo, y después tocá **Conectar**. El conector queda disponible también en la app del celular.

## Uso

En un chat con el conector activado: sacale una foto al plato y mandásela. Claude responde con el semáforo, el por qué y un consejo, y lo anota. "No lo comí" lo borra. También podés decirle "mi cintura hoy es 90" o pedirle el resumen de la semana cruzado con los entrenamientos.

Para un análisis de sangre, adjuntá el PDF o una foto del estudio. Claude guarda todos los valores con la fecha de extracción y te dice cuáles quedaron fuera de rango. Se ven en la pestaña Salud de la app. El archivo no se guarda, solo los números.

Para cortar el acceso: desconectá el conector en claude.ai. Para invalidar todos los tokens, vaciá el KV `OAUTH_KV`.
