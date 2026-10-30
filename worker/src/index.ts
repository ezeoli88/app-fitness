import { OAuthProvider, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { createApp, type Env } from './app';
import { handleAuthorize } from './authorize';
import { createD1Driver } from './d1Driver';
import { handleMcpRequest } from './mcp';

const app = createApp();

type WorkerEnv = Env & { OAUTH_KV: KVNamespace; OAUTH_PROVIDER: OAuthHelpers };

/** Todo lo que no es OAuth ni `/mcp`: la API de la app, el consentimiento y los assets de Vite. */
const site: ExportedHandler<WorkerEnv> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/authorize') return handleAuthorize(request, env);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && request.method === 'GET') {
      const index = new URL(request.url);
      index.pathname = '/index.html';
      return env.ASSETS.fetch(new Request(index, request));
    }
    return asset;
  },
};

/** `/mcp` solo responde con un token emitido por `/authorize`, que exige la sesión de Access del dueño. */
const mcp = {
  fetch: (request: Request, env: WorkerEnv) => handleMcpRequest(request, createD1Driver(env.DB)),
};

const DAY = 24 * 60 * 60;
const providers = new Map<string, OAuthProvider<WorkerEnv>>();

/** El recurso OAuth es una URL absoluta: se arma por origen para servir igual en producción y en local. */
function providerFor(origin: string): OAuthProvider<WorkerEnv> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<WorkerEnv>({
      apiRoute: '/mcp',
      apiHandler: mcp,
      defaultHandler: site,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      accessTokenTTL: 60 * 60,
      refreshTokenTTL: 90 * DAY,
      resourceMetadata: {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        resource_name: 'Rutina',
      },
    });
    providers.set(origin, provider);
  }
  return provider;
}

export default {
  fetch(request, env, ctx) {
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;
