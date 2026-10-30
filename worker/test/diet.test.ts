import { SELF } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createD1Driver } from '../src/d1Driver';
import { handleMcpRequest } from '../src/mcp';

const ORIGIN = 'http://127.0.0.1';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

async function reset(): Promise<void> {
  await env.DB.exec(`
    DELETE FROM meals;
    DELETE FROM waist_measurements;
    DELETE FROM settings;
  `);
}

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, init);
}

function json(body: unknown, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { 'content-type': 'application/json', ...init.headers }, body: JSON.stringify(body) };
}

let rpcId = 0;
function rpc(method: string, params: unknown = {}, headers: Record<string, string> = {}): Request {
  rpcId += 1;
  return new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    ...json({ jsonrpc: '2.0', id: rpcId, method, params }, {
      headers: { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...headers },
    }),
  });
}

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await handleMcpRequest(rpc('tools/call', { name, arguments: args }), createD1Driver(env.DB));
  expect(response.status).toBe(200);
  const body = await response.json() as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> } };
  return body.result;
}

beforeEach(reset);

describe('MCP de dieta', () => {
  it('se presenta con las instrucciones y lista las herramientas', async () => {
    const init = await handleMcpRequest(rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    }), createD1Driver(env.DB));
    const body = await init.json() as { result: { instructions: string; serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('rutina');
    expect(body.result.instructions).toContain('baja en carbohidratos');

    const list = await handleMcpRequest(rpc('tools/list'), createD1Driver(env.DB));
    const tools = (await list.json() as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
    expect(tools).toEqual(['log_meal', 'delete_meal', 'log_waist', 'set_height', 'get_diet_summary', 'get_recent_workouts']);
  });

  it('anota un plato, lo resume y lo borra', async () => {
    const logged = await callTool('log_meal', { title: 'Fideos con tuco', verdict: 'too_much', protein: 'low', carbs: 'high', note: 'La mitad de fideos.' });
    expect(logged.isError).toBeUndefined();
    const meal = logged.structuredContent?.meal as { id: number; day: string };
    expect(logged.content[0].text).toContain('1 mucho');

    const summary = await api('/api/diet/summary?days=7');
    const data = await summary.json() as { meals: { title: string; verdict: string }[]; counts: Record<string, number> };
    expect(data.meals).toMatchObject([{ title: 'Fideos con tuco', verdict: 'too_much' }]);
    expect(data.counts).toEqual({ ok: 0, a_bit_much: 0, too_much: 1 });

    const deleted = await callTool('delete_meal', { id: meal.id });
    expect(deleted.structuredContent).toEqual({ deleted: true });
    const again = await callTool('delete_meal', { id: meal.id });
    expect(again.structuredContent).toEqual({ deleted: false });
  });

  it('rechaza un veredicto desconocido', async () => {
    const response = await handleMcpRequest(rpc('tools/call', {
      name: 'log_meal',
      arguments: { title: 'Pizza', verdict: 'meh', protein: 'low', carbs: 'high' },
    }), createD1Driver(env.DB));
    const body = await response.json() as { result?: { isError?: boolean }; error?: unknown };
    expect(body.error ?? body.result?.isError).toBeTruthy();
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM meals').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('calcula el ratio cintura-altura cuando tiene la altura', async () => {
    const before = await callTool('log_waist', { cm: 90 });
    expect(before.content[0].text).toContain('Falta la altura');
    await callTool('set_height', { cm: 178 });
    const after = await callTool('log_waist', { cm: 89.5 });
    expect(after.structuredContent?.waistToHeight).toBe(0.503);
    expect(after.content[0].text).toContain('menos de 89 cm');
  });
});

describe('API de dieta para la app', () => {
  it('guarda cintura y altura validando el rango', async () => {
    expect((await api('/api/diet/waist', { method: 'POST', ...json({ cm: 12 }) })).status).toBe(422);
    expect((await api('/api/diet/waist', { method: 'POST', ...json({ cm: 91.25 }) })).status).toBe(200);
    expect((await api('/api/diet/height', { method: 'PUT', ...json({ cm: 300 }) })).status).toBe(422);
    expect((await api('/api/diet/height', { method: 'PUT', ...json({ cm: 180 }) })).status).toBe(200);
    const summary = await (await api('/api/diet/summary')).json() as { waist: { cm: number }[]; heightCm: number; waistToHeight: number };
    expect(summary.waist.map((item) => item.cm)).toEqual([91.3]);
    expect(summary.heightCm).toBe(180);
    expect(summary.waistToHeight).toBe(0.507);
  });

  it('exige Access fuera de localhost', async () => {
    const denied = await SELF.fetch('https://rutina.example/api/diet/summary');
    expect(denied.status).toBe(403);
  });
});

describe('OAuth del conector', () => {
  it('pide token en /mcp y publica los metadatos', async () => {
    const unauthorized = await SELF.fetch(rpc('tools/list'));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toContain('resource_metadata');
    const metadata = await api('/.well-known/oauth-protected-resource/mcp');
    expect(await metadata.json()).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    const server = await api('/.well-known/oauth-authorization-server');
    expect(await server.json()).toMatchObject({ authorization_endpoint: `${ORIGIN}/authorize`, token_endpoint: `${ORIGIN}/token` });
  });

  it('solo muestra el consentimiento al dueño', async () => {
    const response = await SELF.fetch('https://rutina.example/authorize?response_type=code&client_id=x');
    expect(response.status).toBe(403);
  });

  it('completa el flujo con PKCE y usa el token en /mcp', async () => {
    const registered = await api('/register', { method: 'POST', ...json({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' }) });
    expect(registered.status).toBe(201);
    const { client_id: clientId } = await registered.json() as { client_id: string };

    const verifier = 'v'.repeat(64);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const query = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, state: 'abc',
      code_challenge: challenge, code_challenge_method: 'S256', resource: `${ORIGIN}/mcp`,
    });
    const consent = await api(`/authorize?${query}`);
    expect(consent.status).toBe(200);
    const html = await consent.text();
    expect(html).toContain('claude.ai');
    const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
    expect(handle).toBeTruthy();
    const cookie = (consent.headers.get('set-cookie') ?? '').split(';')[0];

    const approved = await api(`/authorize?${query}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: handle!, decision: 'approve' }),
      redirect: 'manual',
    });
    expect(approved.status).toBe(302);
    const location = new URL(approved.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(CALLBACK);
    const code = location.searchParams.get('code')!;

    const token = await api('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: clientId, code_verifier: verifier, resource: `${ORIGIN}/mcp` }),
    });
    expect(token.status).toBe(200);
    const { access_token: accessToken } = await token.json() as { access_token: string };

    const list = await SELF.fetch(rpc('tools/list', {}, { authorization: `Bearer ${accessToken}` }));
    expect(list.status).toBe(200);
    const body = await list.json() as { result: { tools: unknown[] } };
    expect(body.result.tools).toHaveLength(6);
  });

  it('rechaza clientes que no son Claude ni locales', async () => {
    const registered = await api('/register', { method: 'POST', ...json({ client_name: 'Otro', redirect_uris: ['https://evil.example/cb'], token_endpoint_auth_method: 'none' }) });
    const { client_id: clientId } = await registered.json() as { client_id: string };
    const query = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: 'https://evil.example/cb', state: 'x',
      code_challenge: 'a'.repeat(43), code_challenge_method: 'S256',
    });
    const response = await api(`/authorize?${query}`);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('no está habilitado');
  });
});
