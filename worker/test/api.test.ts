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

  it('siembra una vez y rechaza un modo desconocido', async () => {
    const first = await api('/api/bootstrap', { method: 'POST', body: JSON.stringify({ mode: 'seed' }) });
    expect(await first.json()).toEqual({ seeded: true });
    const second = await api('/api/bootstrap', { method: 'POST', body: JSON.stringify({ mode: 'seed' }) });
    expect(await second.json()).toEqual({ seeded: false });
    const snapshot = await api('/api/bootstrap', { method: 'POST', body: JSON.stringify({ mode: 'snapshot' }) });
    expect(snapshot.status).toBe(422);
    const home = await api('/api/home');
    const body = await home.json() as { routine: { id: string } | null; days: unknown[] };
    expect(body.routine?.id).toBe('principiantes');
    expect(body.days.length).toBeGreaterThan(0);
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

  it('guarda el peso objetivo y lo devuelve en las lecturas de ejercicios', async () => {
    const exercise = (targetWeightKg: unknown) => ({ id: null, name: 'Press', sets: 3, reps: 8, sort: 0, targetWeightKg });
    const routine = (exercises: unknown[]) => ({
      id: null, title: 'Fuerza', level: 'x', sort: 0,
      days: [{ id: null, title: 'Día A', sort: 0, exercises }],
    });
    const post = (body: unknown) => api('/api/routines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect((await post(routine([exercise(-1)]))).status).toBe(422);
    const saved = await post(routine([exercise(42.5), { id: null, name: 'Remo', sets: 3, reps: 10, sort: 1 }]));
    expect(saved.status).toBe(200);
    const { id } = await saved.json() as { id: string };
    await api('/api/routines/active', { method: 'PUT', body: JSON.stringify({ id }) });

    const draft = await (await api(`/api/routines/${id}/draft`)).json() as { days: { id: number; exercises: { id: number; targetWeightKg: number | null }[] }[] };
    expect(draft.days[0].exercises.map((item) => item.targetWeightKg)).toEqual([42.5, null]);
    const dayId = draft.days[0].id;
    const listed = await (await api(`/api/days/${dayId}/exercises`)).json() as { targetWeightKg: number | null }[];
    expect(listed.map((item) => item.targetWeightKg)).toEqual([42.5, null]);
    const home = await (await api('/api/home')).json() as { days: { exercises: { targetWeightKg: number | null }[] }[] };
    expect(home.days[0].exercises.map((item) => item.targetWeightKg)).toEqual([42.5, null]);

    const [press, remo] = draft.days[0].exercises;
    const hints = await api(`/api/exercises/weight-hints?ids=${press.id},${remo.id}`);
    expect(await hints.json()).toEqual({
      [press.id]: { lastWeightKg: null, targetWeightKg: 42.5 },
      [remo.id]: { lastWeightKg: null, targetWeightKg: null },
    });
    expect((await api('/api/exercises/weight-hints?ids=x')).status).toBe(422);
    expect((await api('/api/exercises/weight-hints')).status).toBe(422);
  });
});

type OpenedSession = {
  id: number;
  status: string;
  completedAt: string | null;
  exercises: { sourceExerciseId: number; series: { setIndex: number; completed: boolean; weightKg: number | null; actualReps: number | null }[] }[];
};

/** Rutina de 7 ejercicios × 4 series con su sesión abierta. */
async function openSevenByFour(): Promise<OpenedSession> {
  const exercises = Array.from({ length: 7 }, (_, sort) => ({ id: null, name: `Ejercicio ${sort + 1}`, sets: 4, reps: 10, sort }));
  const saved = await api('/api/routines', {
    method: 'POST',
    body: JSON.stringify({ id: null, title: 'Larga', level: 'x', sort: 0, days: [{ id: null, title: 'Día A', sort: 0, exercises }] }),
  });
  const { id } = await saved.json() as { id: string };
  const days = await (await api(`/api/days?routineId=${id}`)).json() as { id: number }[];
  return await (await api(`/api/days/${days[0].id}/sessions`, { method: 'POST' })).json() as OpenedSession;
}

function finish(sessionId: number, body: unknown): Promise<Response> {
  return api(`/api/sessions/${sessionId}/finish`, { method: 'POST', body: JSON.stringify(body) });
}

async function details(sessionId: number): Promise<OpenedSession> {
  return await (await api(`/api/sessions/${sessionId}`)).json() as OpenedSession;
}

type SetWrite = { exerciseId: number; setIndex: number; patch: { completed: boolean; weightKg: number | null; actualReps: number | null } };

function allSets(session: OpenedSession, completed: (exerciseIndex: number, setIndex: number) => boolean): SetWrite[] {
  return session.exercises.flatMap((exercise, exerciseIndex) => exercise.series.map((set) => ({
    exerciseId: exercise.sourceExerciseId,
    setIndex: set.setIndex,
    patch: { completed: completed(exerciseIndex, set.setIndex), weightKg: 20 + exerciseIndex + set.setIndex / 2, actualReps: 8 + set.setIndex },
  })));
}

describe('finalizar con series', () => {
  it('guarda las 28 series y cierra la sesión en un solo pedido', async () => {
    const session = await openSevenByFour();
    const sets = allSets(session, () => true);
    expect(sets).toHaveLength(28);
    const response = await finish(session.id, { completedAt: '2026-10-22T10:00:00.000Z', sets });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'completed' });
    const saved = await details(session.id);
    expect(saved.status).toBe('completed');
    expect(saved.completedAt).toBe('2026-10-22T10:00:00.000Z');
    const stored = saved.exercises.flatMap((exercise) => exercise.series.map((set) => ({
      exerciseId: exercise.sourceExerciseId,
      setIndex: set.setIndex,
      patch: { completed: set.completed, weightKg: set.weightKg, actualReps: set.actualReps },
    })));
    expect(stored).toEqual(sets);
  });

  it('marca parcial según las series del mismo pedido y permite borrar valores con null', async () => {
    const session = await openSevenByFour();
    const exerciseId = session.exercises[0].sourceExerciseId;
    await api(`/api/sessions/${session.id}/sets`, {
      method: 'PATCH',
      body: JSON.stringify({ exerciseId, setIndex: 1, patch: { completed: true, weightKg: 50, actualReps: 5 } }),
    });
    const sets = allSets(session, (exerciseIndex, setIndex) => exerciseIndex === 0 && setIndex === 0);
    sets[1] = { exerciseId, setIndex: 1, patch: { completed: false, weightKg: null, actualReps: null } };
    const response = await finish(session.id, { completedAt: '2026-10-22T10:00:00.000Z', sets });
    expect(await response.json()).toEqual({ status: 'partial' });
    const saved = await details(session.id);
    expect(saved.exercises[0].series[0]).toMatchObject({ completed: true, weightKg: 20, actualReps: 8 });
    expect(saved.exercises[0].series[1]).toMatchObject({ completed: false, weightKg: null, actualReps: null });
  });

  it('sigue exigiendo al menos una serie realizada y no escribe nada si falla', async () => {
    const session = await openSevenByFour();
    const response = await finish(session.id, { completedAt: '2026-10-22T10:00:00.000Z', sets: allSets(session, () => false) });
    expect(response.status).toBe(422);
    expect((await response.json() as { error: string }).error).toContain('al menos una serie');
    const saved = await details(session.id);
    expect(saved.status).toBe('open');
    expect(saved.exercises.flatMap((exercise) => exercise.series.map((set) => set.weightKg))).toEqual(Array(28).fill(null));

    // Desmarcar en el mismo pedido la única serie guardada también cuenta.
    const exerciseId = session.exercises[0].sourceExerciseId;
    await api(`/api/sessions/${session.id}/sets`, {
      method: 'PATCH',
      body: JSON.stringify({ exerciseId, setIndex: 0, patch: { completed: true } }),
    });
    const unmarked = await finish(session.id, {
      completedAt: '2026-10-22T10:00:00.000Z',
      sets: [{ exerciseId, setIndex: 0, patch: { completed: false } }],
    });
    expect(unmarked.status).toBe(422);
    expect((await details(session.id)).exercises[0].series[0].completed).toBe(true);
  });

  it('rechaza una serie inexistente sin escribir las demás', async () => {
    const session = await openSevenByFour();
    const sets = allSets(session, () => true);
    sets.push({ exerciseId: session.exercises[0].sourceExerciseId, setIndex: 4, patch: { completed: true, weightKg: 1, actualReps: 1 } });
    const response = await finish(session.id, { completedAt: '2026-10-22T10:00:00.000Z', sets });
    expect(response.status).toBe(409);
    const saved = await details(session.id);
    expect(saved.status).toBe('open');
    expect(saved.exercises.every((exercise) => exercise.series.every((set) => !set.completed && set.weightKg === null))).toBe(true);
  });

  it('valida el formato de las series', async () => {
    const session = await openSevenByFour();
    const exerciseId = session.exercises[0].sourceExerciseId;
    const completedAt = '2026-10-22T10:00:00.000Z';
    const bad: unknown[] = [
      { completedAt, sets: 'todas' },
      { completedAt, sets: [{ exerciseId, setIndex: -1, patch: { completed: true } }] },
      { completedAt, sets: [{ exerciseId: 0, setIndex: 0, patch: { completed: true } }] },
      { completedAt, sets: [{ exerciseId, setIndex: 0, patch: { completed: 'sí' } }] },
      { completedAt, sets: [{ exerciseId, setIndex: 0, patch: { completed: true, extra: 1 } }] },
      { completedAt, sets: [{ exerciseId, setIndex: 0, patch: { completed: true, actualReps: 1.5 } }] },
      { completedAt, sets: [{ exerciseId, setIndex: 0, patch: { completed: true, weightKg: -1 } }] },
      { completedAt, sets: [{ exerciseId, setIndex: 0, patch: { completed: true, actualReps: 0 } }] },
      { sets: [{ exerciseId, setIndex: 0, patch: { completed: true } }] },
    ];
    for (const body of bad) {
      const response = await finish(session.id, body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
    expect((await details(session.id)).status).toBe('open');
  });

  it('mantiene el cierre sin series y no cierra dos veces', async () => {
    const session = await openSevenByFour();
    const exerciseId = session.exercises[0].sourceExerciseId;
    expect((await finish(session.id, { completedAt: '2026-10-22T10:00:00.000Z' })).status).toBe(422);
    await api(`/api/sessions/${session.id}/sets`, {
      method: 'PATCH',
      body: JSON.stringify({ exerciseId, setIndex: 0, patch: { completed: true } }),
    });
    const response = await finish(session.id, { completedAt: '2026-10-22T10:00:00.000Z' });
    expect(await response.json()).toEqual({ status: 'partial' });
    const again = await finish(session.id, { completedAt: '2026-10-22T11:00:00.000Z', sets: allSets(session, () => true) });
    expect(again.status).toBe(409);
    expect((await details(session.id)).completedAt).toBe('2026-10-22T10:00:00.000Z');
  });
});

describe('activos estáticos', () => {
  it('sirve el índice para una ruta de la aplicación', async () => {
    const response = await SELF.fetch('http://127.0.0.1/session/3');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Rutina');
  });
});
