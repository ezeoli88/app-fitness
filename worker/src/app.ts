import { Hono } from 'hono';
import { z } from 'zod';

import type { SqlDriver } from '@/db/core/driver';
import { createGymDb, type GymDb } from '@/db/gymDb';
import { seedCatalog } from '@/db/seed';
import { createSqlSettings, isServerSettingKey } from '@/db/settings';
import { DomainError } from '@/domain/errors';
import catalogJson from '@/data/routines.json';
import type { RoutineJson } from '@/domain/types';

import { allowedDevOrigin, authenticate, devBypassEnabled, devCorsHeaders, type AccessEnv, type Identity } from './access';
import { createD1Driver } from './d1Driver';
import { bulkSetsBody, finishBody,parseExerciseIds, routineDraft, setPatch } from './schemas';

const catalog = catalogJson as RoutineJson[];

export type Env = AccessEnv & {
  DB: D1Database;
  ASSETS: Fetcher;
};

type AppVars = { identity: Identity; gym: GymDb; driver: SqlDriver };

function positiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function invalid(): DomainError {
  return new DomainError('Los datos enviados no tienen el formato esperado.', 422);
}

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
    console.error(error instanceof Error ? error.name : 'Error');
    return c.json({ error: 'No se pudo completar la operación.' }, 500);
  });

  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin') ?? null;
    const bypass = devBypassEnabled(c.req.raw, c.env);
    if (bypass && c.req.method === 'OPTIONS') {
      if (!allowedDevOrigin(origin)) return c.body(null, 403);
      return new Response(null, { status: 204, headers: devCorsHeaders(origin) });
    }
    const identity = await authenticate(c.req.raw, c.env);
    if (!identity) return c.json({ error: 'No autorizado.' }, 403);
    console.log(JSON.stringify({ path: new URL(c.req.url).pathname, kind: identity.kind, email: identity.email }));
    const driver = createD1Driver(c.env.DB);
    c.set('identity', identity);
    c.set('gym', createGymDb(driver));
    c.set('driver', driver);
    await next();
    if (bypass && allowedDevOrigin(origin)) {
      const headers = devCorsHeaders(origin);
      headers.forEach((value, key) => c.res.headers.set(key, value));
    }
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/me', (c) => c.json(c.get('identity')));

  app.get('/api/home', async (c) => c.json(await c.get('gym').getHomeSnapshot()));

  app.get('/api/routines', async (c) => {
    const include = c.req.query('includeArchived') === '1';
    return c.json(await c.get('gym').listRoutines(include));
  });
  app.get('/api/routines/active', async (c) => c.json(await c.get('gym').getActiveRoutine()));
  app.put('/api/routines/active', async (c) => {
    const body = z.object({ id: z.string().min(1) }).safeParse(await readJson(c.req.raw));
    if (!body.success) throw invalid();
    await c.get('gym').setActiveRoutine(body.data.id);
    return c.json({ ok: true });
  });
  app.post('/api/routines', async (c) => {
    const body = routineDraft.safeParse(await readJson(c.req.raw));
    if (!body.success) throw invalid();
    return c.json({ id: await c.get('gym').saveRoutine(body.data) });
  });
  app.get('/api/routines/:id/draft', async (c) => c.json(await c.get('gym').getRoutineDraft(c.req.param('id'))));
  app.post('/api/routines/:id/duplicate', async (c) => c.json({ id: await c.get('gym').duplicateRoutine(c.req.param('id')) }));
  app.post('/api/routines/:id/archive', async (c) => {
    await c.get('gym').archiveRoutine(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.get('/api/days', async (c) => c.json(await c.get('gym').listDays(c.req.query('routineId') || undefined)));
  app.get('/api/days/:id/exercises', async (c) => {
    const id = positiveInt(c.req.param('id'));
    if (!id) throw invalid();
    return c.json(await c.get('gym').listExercises(id));
  });
  app.get('/api/days/:id/open-session', async (c) => {
    const id = positiveInt(c.req.param('id'));
    if (!id) throw invalid();
    return c.json(await c.get('gym').getOpenSession(id));
  });
  app.post('/api/days/:id/sessions', async (c) => {
    const id = positiveInt(c.req.param('id'));
    if (!id) throw invalid();
    return c.json(await c.get('gym').getOrCreateOpenSession(id));
  });

  app.get('/api/sessions/open', async (c) => c.json(await c.get('gym').listOpenSessions()));
  app.get('/api/sessions/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    if (!id) throw invalid();
    return c.json(await c.get('gym').getSessionDetails(id));
  });
  app.get('/api/sessions/:id/sets/state', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const exerciseId = positiveInt(c.req.query('exerciseId') ?? '');
    const setIndex = Number(c.req.query('setIndex'));
    if (!id || !exerciseId || !Number.isSafeInteger(setIndex) || setIndex < 0) throw invalid();
    return c.json(await c.get('gym').getSetState(id, exerciseId, setIndex));
  });
  app.patch('/api/sessions/:id/sets', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const body = z.object({
      exerciseId: z.number().int().positive(),
      setIndex: z.number().int().nonnegative(),
      patch: setPatch,
    }).safeParse(await readJson(c.req.raw));
    if (!id || !body.success) throw invalid();
    await c.get('gym').updateSessionSet(id, body.data.exerciseId, body.data.setIndex, body.data.patch);
    return c.json({ ok: true });
  });
  app.patch('/api/sessions/:id/sets/bulk', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const body = bulkSetsBody.safeParse(await readJson(c.req.raw));
    if (!id || !body.success) throw invalid();
    await c.get('gym').updateSessionSets(id, body.data.sets);
    return c.json({ ok: true });
  });
  app.post('/api/sessions/:id/finish', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const body = finishBody.safeParse(await readJson(c.req.raw));
    if (!id || !body.success) throw invalid();
    return c.json({ status: await c.get('gym').finishSession(id, body.data.completedAt, body.data.sets) });
  });
  app.post('/api/sessions/:id/reopen', async (c) => {
    const id = positiveInt(c.req.param('id'));
    if (!id) throw invalid();
    await c.get('gym').reopenSession(id);
    return c.json({ ok: true });
  });
  app.delete('/api/sessions/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    if (!id) throw invalid();
    await c.get('gym').discardEmptySession(id);
    return c.json({ ok: true });
  });

  app.get('/api/history', async (c) => {
    const limit = Number(c.req.query('limit') ?? '20');
    const offset = Number(c.req.query('offset') ?? '0');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw invalid();
    const scope = c.req.query('scope');
    const routineId = c.req.query('routineId');
    const filter = scope === 'all' ? null : routineId;
    return c.json(await c.get('gym').listCompleted(limit, offset, filter));
  });
  app.get('/api/history/last', async (c) => c.json(await c.get('gym').lastCompleted(c.req.query('routineId') || undefined)));
  app.patch('/api/history/sets/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const body = setPatch.safeParse(await readJson(c.req.raw));
    if (!id || !body.success) throw invalid();
    await c.get('gym').updateHistoricalSet(id, body.data);
    return c.json({ ok: true });
  });
  app.get('/api/exercises/weight-hints', async (c) => {
    const ids = parseExerciseIds(c.req.query('ids'));
    if (!ids) throw invalid();
    return c.json(await c.get('gym').exerciseWeightHints(ids));
  });
  app.get('/api/exercises/:id/previous-sets', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const routineId = c.req.query('routineId');
    if (!id || !routineId) throw invalid();
    return c.json(await c.get('gym').previousExerciseSets(routineId, id));
  });

  app.get('/api/settings/:key', async (c) => {
    const key = c.req.param('key');
    if (!isServerSettingKey(key)) throw invalid();
    return c.json({ value: await createSqlSettings(c.get('driver')).get(key) });
  });
  app.put('/api/settings/:key', async (c) => {
    const key = c.req.param('key');
    const body = z.object({ value: z.string() }).safeParse(await readJson(c.req.raw));
    if (!isServerSettingKey(key) || !body.success) throw invalid();
    await createSqlSettings(c.get('driver')).set(key, body.data.value);
    return c.json({ ok: true });
  });

  app.post('/api/bootstrap', async (c) => {
    const body = z.object({ mode: z.literal('seed') }).safeParse(await readJson(c.req.raw));
    if (!body.success) throw invalid();
    const driver = c.get('driver');
    const count = await driver.first<{ n: number }>('SELECT COUNT(*) AS n FROM routines');
    if ((count?.n ?? 0) > 0) return c.json({ seeded: false });
    await seedCatalog(driver, catalog);
    return c.json({ seeded: true });
  });

  return app;
}
