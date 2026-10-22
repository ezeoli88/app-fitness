// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { act } from 'react';

import { restAlerts } from '@/rest/alerts';
import { RestTimerProvider, useRestTimer } from '@/rest/RestTimer';

const mocks = vi.hoisted(() => {
  const settings = new Map<string, string>();
  const setState = { current: { completed: true, status: 'open' as string } };
  const alerts = {
    permission: vi.fn(async () => 'granted' as const),
    requestPermission: vi.fn(async () => true),
    schedule: vi.fn(async () => 'notification-1'),
    cancel: vi.fn(async () => undefined),
    listScheduled: vi.fn(async () => [] as { id: string; sessionId: number }[]),
    onOpen: vi.fn(() => () => undefined),
    buzz: vi.fn(),
    countdown: vi.fn(),
  };
  return { settings, setState, alerts };
});

vi.mock('@/api/client', () => ({
  gym: { getSetState: async () => mocks.setState.current },
  settings: {
    get: async (key: string) => mocks.settings.get(key) ?? null,
    set: async (key: string, value: string) => { mocks.settings.set(key, value); },
  },
}));

vi.mock('@/rest/alerts', () => ({ restAlerts: mocks.alerts }));

let rest: ReturnType<typeof useRestTimer>;
function Probe() { rest = useRestTimer(); return null; }

async function mount() {
  await act(async () => { render(<RestTimerProvider><Probe /></RestTimerProvider>); });
}

beforeEach(() => {
  mocks.settings.clear();
  mocks.setState.current = { completed: true, status: 'open' };
  vi.clearAllMocks();
  vi.mocked(restAlerts.permission).mockResolvedValue('granted');
  vi.mocked(restAlerts.requestPermission).mockResolvedValue(true);
  vi.mocked(restAlerts.listScheduled).mockResolvedValue([]);
  let serial = 0;
  vi.mocked(restAlerts.schedule).mockImplementation(async () => `notification-${++serial}`);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('rapid restarts, extensions and origin cancellation leave only one timer', async () => {
  await mount();
  await act(async () => { await Promise.all([rest.startRest(1, 2, 3, 0), rest.startRest(1, 2, 3, 1)]); });
  expect(restAlerts.schedule).toHaveBeenCalledTimes(1);
  expect(rest.activeTimer?.setIndex).toBe(1);
  const expires = rest.activeTimer!.expiresAt;
  await act(async () => { await Promise.all([rest.extendRest(), rest.extendRest()]); });
  expect(rest.activeTimer!.expiresAt).toBe(expires + 60_000);
  await act(async () => { await rest.skipRest(1, 3, 0); });
  expect(rest.activeTimer).not.toBeNull();
  await act(async () => { await rest.skipRest(1, 3, 1); });
  expect(rest.activeTimer).toBeNull();
  expect(mocks.settings.get('activeRestTimer')).toBe('');
});

test('the countdown appears and disappears before notification work finishes', async () => {
  await mount();
  let releasePermission!: (value: 'granted') => void;
  vi.mocked(restAlerts.permission).mockImplementationOnce(() =>
    new Promise((resolve) => { releasePermission = resolve; })
  );
  let started!: Promise<void>;
  act(() => { started = rest.startRest(1, 2, 3, 0); });
  expect(rest.activeTimer).toMatchObject({ sessionId: 1, setIndex: 0 });
  expect(rest.remainingSeconds).toBe(90);
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
  expect(releasePermission).toBeDefined();

  let skipped!: Promise<void>;
  act(() => { skipped = rest.skipRest(1, 3, 0); });
  expect(rest.activeTimer).toBeNull();
  releasePermission('granted');
  await act(async () => { await Promise.all([started, skipped]); });
  expect(mocks.settings.get('activeRestTimer')).toBe('');
  expect(restAlerts.schedule).not.toHaveBeenCalled();
});

test('denied permission still persists a countdown, and disabling cancels it', async () => {
  vi.mocked(restAlerts.permission).mockResolvedValue('denied');
  vi.mocked(restAlerts.requestPermission).mockResolvedValue(false);
  await mount();
  await act(async () => { await rest.setDurationSeconds(15); await rest.startRest(1, 2, 3, 0); });
  expect(rest.activeTimer).toMatchObject({ sessionId: 1, notificationId: null });
  expect(rest.remainingSeconds).toBe(15);
  expect(restAlerts.schedule).not.toHaveBeenCalled();
  await expect(rest.setDurationSeconds(601)).rejects.toThrow();
  await act(async () => { await rest.setEnabled(false); await rest.startRest(1, 2, 3, 0); });
  expect(rest.activeTimer).toBeNull();
});

test('reopening keeps the saved notification and cancels orphan duplicates', async () => {
  const timer = { sessionId: 1, dayId: 2, exerciseId: 3, setIndex: 0, expiresAt: Date.now() + 90_000, notificationId: 'saved' };
  mocks.settings.set('activeRestTimer', JSON.stringify(timer));
  vi.mocked(restAlerts.listScheduled).mockResolvedValue([
    { id: 'saved', sessionId: 1 },
    { id: 'orphan', sessionId: 1 },
  ]);
  await mount();
  expect(rest.activeTimer).toEqual(timer);
  expect(restAlerts.schedule).not.toHaveBeenCalled();
  expect(restAlerts.cancel).toHaveBeenCalledWith('orphan');
  expect(restAlerts.cancel).not.toHaveBeenCalledWith('saved');
});

test('a finished session cannot restore a scheduled rest', async () => {
  mocks.settings.set('activeRestTimer', JSON.stringify({ sessionId: 1, dayId: 2, exerciseId: 3, setIndex: 0, expiresAt: Date.now() + 90_000, notificationId: 'saved' }));
  mocks.setState.current = { completed: true, status: 'partial' };
  vi.mocked(restAlerts.listScheduled).mockResolvedValue([{ id: 'saved', sessionId: 1 }]);
  await mount();
  expect(rest.activeTimer).toBeNull();
  expect(restAlerts.cancel).toHaveBeenCalledWith('saved');
});

test('expiry in the foreground buzzes once and clears the timer', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  await mount();
  await act(async () => { await rest.setDurationSeconds(15); await rest.startRest(1, 2, 3, 0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(restAlerts.buzz).toHaveBeenCalledTimes(1);
  expect(rest.activeTimer).toBeNull();
  expect(mocks.settings.get('activeRestTimer')).toBe('');
});
