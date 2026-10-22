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
