import { createApp, type Env } from './app';

const app = createApp();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
} satisfies ExportedHandler<Env>;
