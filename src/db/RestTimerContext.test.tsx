import { act, create } from 'react-test-renderer';
import * as Notifications from 'expo-notifications';
import { AppState, Vibration } from 'react-native';
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
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

let rest: ReturnType<typeof useRestTimer>;
function Probe() { rest = useRestTimer(); return null; }
let tree: ReturnType<typeof create>;
async function mount() { await act(async () => { tree = create(<RestTimerProvider><Probe /></RestTimerProvider>); }); }

beforeEach(() => {
  mockSettings.clear();
  mockSetState.current = { completed: true, status: 'open' };
  jest.clearAllMocks();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true, canAskAgain: true } as never);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([]);
  let serial = 0;
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async () => `notification-${++serial}`);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

test('rapid restarts, extensions and origin cancellation leave only one timer', async () => {
  await mount();
  await act(async () => { await Promise.all([rest.startRest(1, 2, 3, 0), rest.startRest(1, 2, 3, 1)]); });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
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
  let releasePermission!: (value: { granted: boolean; canAskAgain?: boolean }) => void;
  jest.mocked(Notifications.getPermissionsAsync).mockImplementationOnce(() =>
    new Promise((resolve) => { releasePermission = resolve as typeof releasePermission; }) as never
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
  releasePermission({ granted: true, canAskAgain: true });
  await act(async () => { await Promise.all([started, skipped]); });
  expect(mockSettings.get('activeRestTimer')).toBe('');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('denied permission still persists a countdown, and disabling cancels it', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false, canAskAgain: true } as never);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: false } as never);
  await mount();
  await act(async () => { await rest.setDurationSeconds(15); await rest.startRest(1, 2, 3, 0); });
  expect(rest.activeTimer).toMatchObject({ sessionId: 1, notificationId: null });
  expect(rest.remainingSeconds).toBe(15);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  await expect(rest.setDurationSeconds(601)).rejects.toThrow();
  await act(async () => { await rest.setEnabled(false); await rest.startRest(1, 2, 3, 0); });
  expect(rest.activeTimer).toBeNull();
});

test('reopening keeps the saved notification and cancels orphan duplicates', async () => {
  const timer = { sessionId: 1, dayId: 2, exerciseId: 3, setIndex: 0, expiresAt: Date.now() + 90_000, notificationId: 'saved' };
  mockSettings.set('activeRestTimer', JSON.stringify(timer));
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
    { identifier: 'saved', content: { data: { kind: 'rest-timer', sessionId: 1 } } },
    { identifier: 'orphan', content: { data: { kind: 'rest-timer', sessionId: 1 } } },
  ] as never);
  await mount();
  expect(rest.activeTimer).toEqual(timer);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan');
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('saved');
});

test('a finished session cannot restore a scheduled rest', async () => {
  mockSettings.set('activeRestTimer', JSON.stringify({ sessionId: 1, dayId: 2, exerciseId: 3, setIndex: 0, expiresAt: Date.now() + 90_000, notificationId: 'saved' }));
  mockSetState.current = { completed: true, status: 'partial' };
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
    { identifier: 'saved', content: { data: { kind: 'rest-timer', sessionId: 1 } } },
  ] as never);
  await mount();
  expect(rest.activeTimer).toBeNull();
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('saved');
});

test('expiry in the foreground vibrates without removing the delivered notification', async () => {
  jest.useFakeTimers();
  const oldState = AppState.currentState;
  AppState.currentState = 'active';
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
  try {
    await mount();
    await act(async () => { await rest.setDurationSeconds(15); await rest.startRest(1, 2, 3, 0); });
    await act(async () => { jest.advanceTimersByTime(15_000); });
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(rest.activeTimer).toBeNull();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    expect(mockSettings.get('activeRestTimer')).toBe('');
  } finally {
    await act(async () => tree.unmount());
    tree = undefined as never;
    vibrate.mockRestore();
    AppState.currentState = oldState;
    jest.useRealTimers();
  }
});
