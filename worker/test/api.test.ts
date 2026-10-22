import { SELF } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

async function reset(): Promise<void> {
  await env.DB.exec(`
    DELETE FROM sessions;
    DELETE FROM exercises;
    DELETE FROM days;
    DELETE FROM routines;
    DELETE FROM settings;
    DELETE FROM tombstones;
  `);
}

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://127.0.0.1${path}`, init);
}

beforeEach(reset);

describe('API', () => {
  it('exige Access fuera de localhost y responde health en el bypass local', async () => {
    const denied = await SELF.fetch('https://rutina.example/api/health');
    expect(denied.status).toBe(403);
    const health = await api('/api/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    const me = await api('/api/me');
    expect(await me.json()).toMatchObject({ email: 'dev@localhost', kind: 'dev' });
  });

  it('habilita CORS solo para el origen de desarrollo', async () => {
    const allowed = await api('/api/health', { method: 'OPTIONS', headers: { origin: 'http://localhost:8081' } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    const blocked = await api('/api/health', { method: 'OPTIONS', headers: { origin: 'https://otro.example' } });
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
    const read = await api('/api/health', { headers: { origin: 'http://127.0.0.1:8081' } });
    expect(read.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8081');
    const foreign = await SELF.fetch('https://rutina.example/api/health', { headers: { origin: 'http://localhost:8081' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('siembra una vez y rechaza una instantánea sobre datos', async () => {
    const first = await api('/api/bootstrap', { method: 'POST', body: JSON.stringify({ mode: 'seed' }) });
    expect(await first.json()).toEqual({ seeded: true });
    const second = await api('/api/bootstrap', { method: 'POST', body: JSON.stringify({ mode: 'seed' }) });
    expect(await second.json()).toEqual({ seeded: false });
    const snapshot = await api('/api/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ mode: 'snapshot', snapshot: { routines: [], days: [], exercises: [], sessions: [], sessionExercises: [], sessionSets: [] } }),
    });
    expect(snapshot.status).toBe(409);
    const home = await api('/api/home');
    const body = await home.json() as { routine: { id: string } | null };
    expect(body.routine?.id).toBe('principiantes');
  });

  it('traduce un borrador inválido a 422 y no filtra errores internos', async () => {
    const saved = await api('/api/routines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: null, title: '', level: 'x', sort: 0, days: [] }),
    });
    expect(saved.status).toBe(422);
    const message = await saved.json() as { error: string };
    expect(message.error).toContain('nombre');
    const malformed = await api('/api/routines', { method: 'POST', body: '{' });
    expect(malformed.status).toBe(422);
  });
});

describe('activos estáticos', () => {
  it('sirve el índice para una ruta de la aplicación', async () => {
    const response = await SELF.fetch('http://127.0.0.1/session/3');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Rutina');
  });
});
