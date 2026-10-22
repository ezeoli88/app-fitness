import { exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { describe, expect, it } from 'vitest';

import { accessCertsUrl, authenticate, type AccessEnv, type AccessVerifier } from './access';

const env: AccessEnv = {
  ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  ACCESS_AUD: 'aud-tag',
  OWNER_EMAIL: 'owner@example.com',
  ACCESS_SERVICE_CLIENT_IDS: 'ci-smoke.access',
};

function request(url: string, headers?: HeadersInit): Request {
  return new Request(url, { headers });
}

async function verifierFor(audience = env.ACCESS_AUD, issuer = env.ACCESS_TEAM_DOMAIN): Promise<{
  verify: AccessVerifier;
  sign: (claims: JWTPayload) => Promise<string>;
}> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const verify: AccessVerifier = async (token) => {
    const { payload } = await jwtVerify(token, publicKey, { audience, issuer });
    void jwk;
    return payload;
  };
  return {
    verify,
    sign: (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setIssuer(issuer).setAudience(audience).setExpirationTime('2h').sign(privateKey),
  };
}

describe('Access', () => {
  it('arma la URL de los certificados del equipo', () => {
    expect(accessCertsUrl('https://team.cloudflareaccess.com/')).toBe('https://team.cloudflareaccess.com/cdn-cgi/access/certs');
  });

  it('rechaza sin token, con firma o audiencia inválida, y con otro email', async () => {
    expect(await authenticate(request('http://rutina.example/api/health'), env, async () => ({}))).toBeNull();
    const { verify, sign } = await verifierFor();
    const bad = await authenticate(request('https://rutina.example/api/me', { 'Cf-Access-Jwt-Assertion': 'no-es-jwt' }), env, verify);
    expect(bad).toBeNull();
    const otherAudience = await verifierFor('otro');
    const token = await otherAudience.sign({ email: 'owner@example.com' });
    expect(await authenticate(request('https://rutina.example/api/me', { 'Cf-Access-Jwt-Assertion': token }), env, verify)).toBeNull();
    const wrong = await sign({ email: 'otra@example.com' });
    expect(await authenticate(request('https://rutina.example/api/me', { 'Cf-Access-Jwt-Assertion': wrong }), env, verify)).toBeNull();
  });

  it('acepta el email del dueño y el common_name de un token de servicio', async () => {
    const { verify, sign } = await verifierFor();
    const owner = await sign({ email: 'Owner@Example.com' });
    expect(await authenticate(request('https://rutina.example/api/me', { 'Cf-Access-Jwt-Assertion': owner }), env, verify))
      .toEqual({ email: 'Owner@Example.com', kind: 'owner' });
    const service = await sign({ common_name: 'ci-smoke.access' });
    expect(await authenticate(request('https://rutina.example/api/me', { 'Cf-Access-Jwt-Assertion': service }), env, verify))
      .toEqual({ email: 'ci-smoke.access', kind: 'service' });
  });

  it('ignora el bypass si el host no es local', async () => {
    const local = { ...env, DEV_BYPASS_ACCESS: '1' };
    expect(await authenticate(request('http://127.0.0.1:8787/api/health'), local)).toEqual({ email: 'dev@localhost', kind: 'dev' });
    expect(await authenticate(request('https://rutina.workers.dev/api/health'), local)).toBeNull();
  });
});
