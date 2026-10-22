/** @jest-environment node */

import { createHttpGymDb } from '@/data/httpGymDb';
import { copyPreviousWrites, emptyFinishChoice, finishSetWrites, markSetWrites, setsWithEnteredValues } from '@/domain/session';
import type { SessionDetails } from '@/domain/types';
import { isSessionExpired, pendingWriteCount, resetSessionNoticeForTests } from '@/data/sessionExpiry';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  resetSessionNoticeForTests();
});

test('serializes writes and keeps the queue after an expired read', async () => {
  resetSessionNoticeForTests();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started: string[] = [];
  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    started.push(method);
    if (method === 'GET') return json(null, 401);
    await gate;
    return json({ ok: true });
  }) as typeof fetch;

  const gym = createHttpGymDb('http://127.0.0.1:8787/api');
  const first = gym.archiveRoutine('a');
  const second = gym.archiveRoutine('b');
  for (let step = 0; step < 5 && !started.includes('POST'); step++) await Promise.resolve();
  expect(started.filter((method) => method === 'POST')).toEqual(['POST']);
  expect(pendingWriteCount()).toBeGreaterThan(0);
  const expired = gym.getHomeSnapshot().then(() => false, () => true);
  expect(await expired).toBe(true);
  expect(isSessionExpired()).toBe(true);
  release();
  await Promise.all([first, second]);
  expect(started.filter((method) => method === 'POST')).toEqual(['POST', 'POST']);
  expect(pendingWriteCount()).toBe(0);
});

test('asks for weight hints in one read and skips the request without exercises', async () => {
  const urls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return json({ 3: { lastWeightKg: 50, targetWeightKg: 60 } });
  }) as typeof fetch;
  const gym = createHttpGymDb('/api');
  expect(await gym.exerciseWeightHints([])).toEqual({});
  expect(urls).toEqual([]);
  expect(await gym.exerciseWeightHints([3, 4])).toEqual({ 3: { lastWeightKg: 50, targetWeightKg: 60 } });
  expect(urls).toEqual(['/api/exercises/weight-hints?ids=3%2C4']);
});

test('finishes a 7 × 4 session with all its sets in a single request', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return json({ status: 'partial' });
  }) as typeof fetch;
  const gym = createHttpGymDb('/api');
  const sets = Array.from({ length: 28 }, (_, index) => ({
    exerciseId: 10 + Math.floor(index / 4),
    setIndex: index % 4,
    patch: { completed: index % 2 === 0, weightKg: 20 + index, actualReps: index % 3 === 0 ? null : 8 },
  }));
  expect(await gym.finishSession(5, '2026-10-22T10:00:00.000Z', sets)).toBe('partial');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    url: '/api/sessions/5/finish',
    method: 'POST',
    body: { completedAt: '2026-10-22T10:00:00.000Z', sets },
  });

  calls.length = 0;
  await gym.finishSession(5, '2026-10-22T10:00:00.000Z');
  expect(calls.map((call) => call.body)).toEqual([{ completedAt: '2026-10-22T10:00:00.000Z' }]);
});

test('copies the previous values of N sets in a single request', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return json({ ok: true });
  }) as typeof fetch;
  const gym = createHttpGymDb('/api');
  const exercise = {
    id: 100, sessionId: 5, sourceExerciseId: 10, name: 'Press', sets: 6, reps: 8, sort: 0,
    series: Array.from({ length: 6 }, (_, setIndex) => ({
      id: setIndex + 1, sessionExerciseId: 100, setIndex, completed: false, weightKg: null, actualReps: null,
    })),
  };
  const previous = exercise.series.map((set, index) => ({ ...set, id: 50 + index, completed: true, weightKg: 40 + index, actualReps: 8 }));
  const sets = copyPreviousWrites(exercise, previous);
  expect(sets).toHaveLength(6);
  await gym.updateSessionSets(5, sets);
  expect(calls).toEqual([{ url: '/api/sessions/5/sets/bulk', method: 'PATCH', body: { sets } }]);
  expect(sets.every((set) => !('completed' in set.patch))).toBe(true);
});

test('marks the sets with data and finishes in the same single request', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return json({ status: 'partial' });
  }) as typeof fetch;
  const gym = createHttpGymDb('/api');
  const session: SessionDetails = {
    id: 5, dayId: 1, startedAt: '2026-10-22T09:00:00.000Z', completedAt: null, completedSets: {},
    status: 'open', routineId: 'r', routineTitle: 'R', dayTitle: 'D',
    exercises: [{
      id: 100, sessionId: 5, sourceExerciseId: 10, name: 'Press', sets: 3, reps: 12, sort: 0,
      series: [
        { id: 1, sessionExerciseId: 100, setIndex: 0, completed: false, weightKg: 40, actualReps: 12 },
        { id: 2, sessionExerciseId: 100, setIndex: 1, completed: false, weightKg: null, actualReps: 12 },
        { id: 3, sessionExerciseId: 100, setIndex: 2, completed: false, weightKg: null, actualReps: 10 },
      ],
    }],
  };
  const entered = setsWithEnteredValues(session, () => undefined, () => false);
  const choice = emptyFinishChoice(0, entered);
  expect(choice).toEqual({ kind: 'mark', sets: [{ exerciseId: 10, setIndex: 0 }, { exerciseId: 10, setIndex: 2 }] });
  const sets = markSetWrites(finishSetWrites(session, () => undefined), entered);
  expect(await gym.finishSession(5, '2026-10-22T10:00:00.000Z', sets)).toBe('partial');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ url: '/api/sessions/5/finish', method: 'POST' });
  expect((calls[0].body as { sets: { patch: { completed: boolean } }[] }).sets.map((set) => set.patch.completed))
    .toEqual([true, false, true]);
});

test('does not retry an access denial', async () => {
  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    return json({ error: 'No autorizado.' }, 403);
  }) as typeof fetch;
  const gym = createHttpGymDb('/api');
  await expect(gym.listRoutines()).rejects.toThrow('Tu sesión venció');
  expect(calls).toBe(1);
});
