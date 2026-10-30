import { AuthorizationError, CimdFetchError, type ConsentDescription, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { authenticate, type AccessEnv } from './access';

/**
 * Destinos de los códigos: el conector de claude.ai (web, escritorio y celular) y las apps locales
 * (Claude Code). Cualquier otro cliente se rechaza aunque se haya registrado solo.
 */
const ALLOWED_REDIRECT_HOSTS = ['claude.ai', 'claude.com'];

export function isAllowedRedirect(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.protocol === 'https:' && ALLOWED_REDIRECT_HOSTS.includes(url.hostname)) return true;
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  return loopback && (url.protocol === 'http:' || url.protocol === 'https:');
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(`<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: dark; --bg: #070b12; --card: #101826; --text: #f3f7ff; --muted: #7e90a8; --chalk: #ffe14d; --border: #1c2b3f; }
  @media (prefers-color-scheme: light) { :root { color-scheme: light; --bg: #f3f8fc; --card: #fff; --text: #0b1220; --muted: #5b6b7a; --chalk: #00b85c; --border: #d5e2ec; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 "Segoe UI", "Helvetica Neue", sans-serif; }
  main { max-width: 480px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 24px; letter-spacing: -0.5px; margin: 0 0 12px; }
  p { color: var(--muted); margin: 0 0 12px; }
  strong { color: var(--text); }
  .warn { border: 1px solid var(--chalk); border-radius: 12px; padding: 10px 12px; }
  .actions { display: flex; gap: 10px; margin-top: 20px; }
  button { font: inherit; font-weight: 700; border-radius: 12px; padding: 12px 18px; cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--text); }
  button.allow { background: var(--chalk); color: var(--bg); border-color: var(--chalk); }
</style>
<main>${body}</main>
</html>`, { status, headers });
}

function consentPage(details: ConsentDescription, handle: string, headers: Headers): Response {
  const name = escape(details.clientName);
  const loopback = details.redirectIsLoopback
    ? '<p class="warn">El acceso va a una app de esta computadora. Seguí solo si recién lo pediste desde ahí.</p>'
    : '';
  return page(`Conectar ${details.clientName}`, `
  <h1>¿Conectar ${name} con Rutina?</h1>
  <p>Va a poder anotar platos y medidas de cintura, y leer tu dieta y tus entrenamientos.</p>
  <p>El acceso se envía a <strong>${escape(details.redirectHost)}</strong>.</p>
  ${loopback}
  <form method="post">
    <input type="hidden" name="handle" value="${escape(handle)}">
    <div class="actions">
      <button class="allow" name="decision" value="approve">Conectar</button>
      <button name="decision" value="deny">Cancelar</button>
    </div>
  </form>`, 200, headers);
}

function errorPage(message: string, status = 400): Response {
  return page('No se pudo conectar', `<h1>No se pudo conectar</h1><p>${escape(message)}</p>`, status);
}

/**
 * `/authorize` queda detrás de Cloudflare Access: solo el dueño ve el consentimiento.
 * El resto del flujo OAuth (token, registro, metadatos) lo resuelve la librería.
 */
export async function handleAuthorize(request: Request, env: AccessEnv & { OAUTH_PROVIDER: OAuthHelpers }): Promise<Response> {
  const identity = await authenticate(request, env);
  if (!identity || identity.kind === 'service') return errorPage('Entrá con tu cuenta de Rutina para conectar Claude.', 403);
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      if (!isAllowedRedirect(authRequest.redirectUri)) return errorPage('Este cliente no está habilitado. Solo se aceptan Claude y apps locales.');
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      return consentPage(details, consent.handle, consent.headers);
    }
    if (request.method === 'POST') {
      const form = await request.formData();
      const handle = String(form.get('handle') ?? '');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle);
      if (!isAllowedRedirect(approved.request.redirectUri)) return errorPage('Este cliente no está habilitado.');
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: identity.email,
        metadata: {},
        scope: approved.request.scope,
        props: { email: identity.email },
      });
      approved.headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo && request.method === 'GET') {
      return Response.redirect(error.redirectTo, 302);
    }
    if (error instanceof AuthorizationError) return errorPage(error.description);
    if (error instanceof CimdFetchError) return errorPage('No se pudo verificar la app que pide acceso.');
    throw error;
  }
}
