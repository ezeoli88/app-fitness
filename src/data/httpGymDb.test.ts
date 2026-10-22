/** @jest-environment node */

import { createHttpGymDb } from '@/data/httpGymDb';
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
