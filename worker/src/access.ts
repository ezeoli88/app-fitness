import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type Identity = { email: string; kind: 'owner' | 'service' | 'dev' };

export type AccessEnv = {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  OWNER_EMAIL: string;
  ACCESS_SERVICE_CLIENT_IDS?: string;
  DEV_BYPASS_ACCESS?: string;
};

export type AccessVerifier = (token: string, env: AccessEnv) => Promise<JWTPayload>;

const DEV_WEB_ORIGINS = ['http://localhost:8081', 'http://127.0.0.1:8081'];
const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function accessCertsUrl(teamDomain: string): string {
  return `${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`;
}

export function requestHost(request: Request): string {
  const header = request.headers.get('host') ?? new URL(request.url).host;
  return header.split(':')[0].toLowerCase();
}

export function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

export function devBypassEnabled(request: Request, env: AccessEnv): boolean {
  return env.DEV_BYPASS_ACCESS === '1' && isLocalHost(requestHost(request));
}

export function allowedDevOrigin(origin: string | null): origin is string {
  return origin !== null && DEV_WEB_ORIGINS.includes(origin);
}

export function devCorsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('vary', 'Origin');
  return headers;
}

function jwks(teamDomain: string) {
  const url = accessCertsUrl(teamDomain);
  let cached = jwksByDomain.get(url);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(url));
    jwksByDomain.set(url, cached);
  }
  return cached;
}

async function verifyWithAccess(token: string, env: AccessEnv): Promise<JWTPayload> {
  const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
  const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
    issuer,
    audience: env.ACCESS_AUD,
  });
  return payload;
}

export function identityFromPayload(payload: JWTPayload, env: AccessEnv): Identity | null {
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (email && email.toLowerCase() === env.OWNER_EMAIL.trim().toLowerCase()) {
    return { email, kind: 'owner' };
  }
  const commonName = typeof payload.common_name === 'string' ? payload.common_name : '';
  const allowed = (env.ACCESS_SERVICE_CLIENT_IDS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (commonName && allowed.includes(commonName)) return { email: commonName, kind: 'service' };
  return null;
}

export async function authenticate(
  request: Request,
  env: AccessEnv,
  verify: AccessVerifier = verifyWithAccess,
): Promise<Identity | null> {
  if (devBypassEnabled(request, env)) return { email: 'dev@localhost', kind: 'dev' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    return identityFromPayload(await verify(token, env), env);
  } catch {
    return null;
  }
}
