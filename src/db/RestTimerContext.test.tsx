import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';

import { restAlerts } from '@/platform/restAlerts';
import { RestTimerProvider, useRestTimer } from './RestTimerContext';

const mockSettings = new Map<string, string>();
const mockSetState = { current: { completed: true, status: 'open' as string } };
const mockSettingsStore = {
  get: async (key: string) => mockSettings.get(key) ?? null,
  set: async (key: string, value: string) => { mockSettings.set(key, value); },
};
const mockGym = { getSetState: async () => mockSetState.current };

jest.mock('@/data/DataProvider', () => ({
  useData: () => ({
    settings: mockSettingsStore,
    gym: mockGym,
    databaseError: null,
    retry: () => undefined,
  }),
}));

jest.mock('@/platform/restAlerts', () => ({
  restAlerts: {
    permission: jest.fn(async () => 'granted'),
    requestPermission: jest.fn(async () => true),
    schedule: jest.fn(async () => 'notification-1'),
    cancel: jest.fn(async () => undefined),
    listScheduled: jest.fn(async () => []),
    onOpen: jest.fn(() => () => undefined),
    buzz: jest.fn(),
    countdown: jest.fn(),
  },
}));

let rest: ReturnType<typeof useRestTimer>;
function Probe() { rest = useRestTimer(); return null; }
let tree: ReturnType<typeof create>;
async function mount() { await act(async () => { tree = create(<RestTimerProvider><Probe /></RestTimerProvider>); }); }

beforeEach(() => {
  mockSettings.clear();
  mockSetState.current = { completed: true, status: 'open' };
  jest.clearAllMocks();
  jest.mocked(restAlerts.permission).mockResolvedValue('granted');
  jest.mocked(restAlerts.requestPermission).mockResolvedValue(true);
  jest.mocked(restAlerts.listScheduled).mockResolvedValue([]);
  let serial = 0;
  jest.mocked(restAlerts.schedule).mockImplementation(async () => `notification-${++serial}`);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

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
  expect(mockSettings.get('activeRestTimer')).toBe('');
});

test('the countdown appears and disappears before notification work finishes', async () => {
  await mount();
  let releasePermission!: (value: 'granted') => void;
  jest.mocked(restAlerts.permission).mockImplementationOnce(() =>
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
  expect(mockSettings.get('activeRestTimer')).toBe('');
  expect(restAlerts.schedule).not.toHaveBeenCalled();
});

test('denied permission still persists a countdown, and disabling cancels it', async () => {
  jest.mocked(restAlerts.permission).mockResolvedValue('denied');
  jest.mocked(restAlerts.requestPermission).mockResolvedValue(false);
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
  mockSettings.set('activeRestTimer', JSON.stringify(timer));
  jest.mocked(restAlerts.listScheduled).mockResolvedValue([
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
  mockSettings.set('activeRestTimer', JSON.stringify({ sessionId: 1, dayId: 2, exerciseId: 3, setIndex: 0, expiresAt: Date.now() + 90_000, notificationId: 'saved' }));
  mockSetState.current = { completed: true, status: 'partial' };
  jest.mocked(restAlerts.listScheduled).mockResolvedValue([{ id: 'saved', sessionId: 1 }]);
  await mount();
  expect(rest.activeTimer).toBeNull();
  expect(restAlerts.cancel).toHaveBeenCalledWith('saved');
});

test('expiry in the foreground buzzes once and clears the timer', async () => {
  jest.useFakeTimers();
  const oldState = AppState.currentState;
  AppState.currentState = 'active';
  try {
    await mount();
    await act(async () => { await rest.setDurationSeconds(15); await rest.startRest(1, 2, 3, 0); });
    await act(async () => { jest.advanceTimersByTime(15_000); });
    expect(restAlerts.buzz).toHaveBeenCalledTimes(1);
    expect(rest.activeTimer).toBeNull();
    expect(mockSettings.get('activeRestTimer')).toBe('');
  } finally {
    await act(async () => tree.unmount());
    tree = undefined as never;
    AppState.currentState = oldState;
    jest.useRealTimers();
  }
});
