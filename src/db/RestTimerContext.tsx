import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

import { getSetting, setSetting } from '@/db/settings';
import type { RestTimer } from '@/domain/types';

const ENABLED_KEY = 'restEnabled';
const DURATION_KEY = 'restDurationSeconds';
const ACTIVE_KEY = 'activeRestTimer';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type RestTimerContextValue = {
  enabled: boolean;
  durationSeconds: number;
  activeTimer: RestTimer | null;
  remainingSeconds: number;
  notificationsAllowed: boolean | null;
  permissionMessage: string | null;
  setEnabled(enabled: boolean): Promise<void>;
  setDurationSeconds(seconds: number): Promise<void>;
  startRest(sessionId: number, dayId: number, exerciseId: number, setIndex: number): Promise<void>;
  extendRest(): Promise<void>;
  skipRest(sessionId?: number, exerciseId?: number, setIndex?: number): Promise<void>;
};

const RestTimerContext = createContext<RestTimerContextValue | null>(null);

async function ensureRestChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('rest-timer', {
    name: 'Descanso entre series',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 250, 200, 250],
  });
}

async function canNotify(ask: boolean): Promise<boolean> {
  await ensureRestChannel();
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return true;
  if (!ask || !permissions.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [enabled, setEnabledState] = useState(true);
  const [durationSeconds, setDurationState] = useState(90);
  const [activeTimer, setActiveTimer] = useState<RestTimer | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [notificationsAllowed, setNotificationsAllowed] = useState<boolean | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const activeRef = useRef<RestTimer | null>(null);
  const enabledRef = useRef(true);
  const durationRef = useRef(90);
  const didVibrate = useRef<number | null>(null);
  const scheduledId = useRef<string | null>(null);
  const operation = useRef<Promise<unknown>>(Promise.resolve());

  const serialize = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = operation.current.catch(() => undefined).then(task);
    operation.current = next.catch(() => undefined);
    return next;
  }, []);

  const cancelNotification = useCallback(async (notificationId: string | null) => {
    if (!notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await Notifications.dismissNotificationAsync(notificationId);
    } catch {
      // The OS may already have delivered or cleared this timer notification.
    }
  }, []);

  const publishTimer = useCallback((next: RestTimer | null) => {
    activeRef.current = next;
    setActiveTimer(next);
    setRemainingSeconds(next ? Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)) : 0);
    didVibrate.current = null;
  }, []);

  const replaceTimer = useCallback(
    async (next: RestTimer | null, requestPermission: boolean) => {
      const previousId = scheduledId.current;
      scheduledId.current = null;
      await cancelNotification(previousId);
      if (activeRef.current !== next) return;
      if (!next) {
        await setSetting(db, ACTIVE_KEY, '');
        return;
      }

      let notificationId: string | null = null;
      let allowed = false;
      try {
        const asked = await getSetting(db, 'restPermissionRequested');
        const ask = requestPermission && asked !== 'true';
        if (ask) await setSetting(db, 'restPermissionRequested', 'true');
        allowed = await canNotify(ask);
      } catch { /* Counter works without notifications. */ }
      if (activeRef.current !== next) return;
      if (allowed) {
        try {
          notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Descanso terminado',
              body: 'Ya podés continuar con tu entrenamiento.',
              data: { kind: 'rest-timer', sessionId: next.sessionId, dayId: next.dayId },
              ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: Math.max(1, Math.ceil((next.expiresAt - Date.now()) / 1000)),
              ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
            },
          });
          setNotificationsAllowed(true);
          setPermissionMessage(null);
        } catch {
          setNotificationsAllowed(false);
          setPermissionMessage('El aviso en segundo plano no está disponible. El contador sigue funcionando mientras la app está abierta.');
        }
      } else {
        setNotificationsAllowed(false);
        setPermissionMessage('Permití las notificaciones para recibir el aviso con la app en segundo plano.');
      }

      const persisted = { ...next, notificationId };
      scheduledId.current = notificationId;
      await setSetting(db, ACTIVE_KEY, JSON.stringify(persisted));
      if (activeRef.current === next) publishTimer(persisted);
    },
    [cancelNotification, db, publishTimer]
  );

  useEffect(() => {
    let mounted = true;
    void serialize(async () => {
      try {
        const [enabledValue, durationValue, rawTimer, permissions] = await Promise.all([
          getSetting(db, ENABLED_KEY),
          getSetting(db, DURATION_KEY),
          getSetting(db, ACTIVE_KEY),
          Notifications.getPermissionsAsync().catch(() => ({ granted: false })),
        ]);
        if (!mounted) return;
        enabledRef.current = enabledValue !== 'false';
        setEnabledState(enabledRef.current);
        const parsedDuration = Number(durationValue);
        if (Number.isSafeInteger(parsedDuration) && parsedDuration >= 15 && parsedDuration <= 600) {
          durationRef.current = parsedDuration;
          setDurationState(parsedDuration);
        }
        setNotificationsAllowed(permissions.granted);
        const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
        let parsed: RestTimer | null = null;
        try { parsed = rawTimer ? JSON.parse(rawTimer) : null; } catch { /* Invalid saved timer. */ }
        const origin = parsed && await db.getFirstAsync<{ completed: number; status: string }>(
          'SELECT ss.completed, s.status FROM sessions s JOIN session_exercises se ON se.session_id = s.id JOIN session_sets ss ON ss.session_exercise_id = se.id WHERE s.id = ? AND se.source_exercise_id = ? AND ss.set_index = ?',
          parsed.sessionId, parsed.exerciseId, parsed.setIndex ?? -1
        );
        const valid = parsed && enabledRef.current && Number.isFinite(parsed.expiresAt) && parsed.expiresAt > Date.now() && origin?.status === 'open' && origin.completed;
        for (const notification of scheduled) {
          if (notification.content.data?.kind === 'rest-timer' && (!valid || notification.identifier !== parsed?.notificationId)) {
            await cancelNotification(notification.identifier);
          }
        }
        if (!valid || !parsed) {
          await setSetting(db, ACTIVE_KEY, '');
          return;
        }
        let notificationId = parsed.notificationId ?? null;
        if (permissions.granted) {
          await ensureRestChannel();

          const stillScheduled = scheduled.some((item) => item.identifier === notificationId);
          if (!stillScheduled) {
            notificationId = await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Descanso terminado',
                body: 'Ya podés continuar con tu entrenamiento.',
                data: { kind: 'rest-timer', sessionId: parsed.sessionId, dayId: parsed.dayId },
                ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(1, Math.ceil((parsed.expiresAt - Date.now()) / 1000)),
                ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
              },
            }).catch(() => null);
          }
        }
        const restored = { ...parsed, notificationId };
        await setSetting(db, ACTIVE_KEY, JSON.stringify(restored));
        if (!mounted) return;
        scheduledId.current = notificationId;
        publishTimer(restored);
      } catch {
        if (mounted) setPermissionMessage('No se pudo recuperar el descanso guardado.');
      }
    });
    return () => {
      mounted = false;
    };
  }, [cancelNotification, db, publishTimer, serialize]);

  useEffect(() => {
    if (!activeTimer) return;
    const tick = () => {
      if (AppState.currentState !== 'active' || activeRef.current !== activeTimer) return;
      const left = Math.max(0, Math.ceil((activeTimer.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left === 0 && didVibrate.current !== activeTimer.expiresAt) {
        didVibrate.current = activeTimer.expiresAt;
        Vibration.vibrate([0, 250, 200, 250]);
        void serialize(async () => {
          if (activeRef.current !== activeTimer) return;
          // A delivered notification must remain tappable after the countdown expires.
          await setSetting(db, ACTIVE_KEY, '');
          publishTimer(null);
        }).catch(() => setPermissionMessage('No se pudo guardar el fin del descanso.'));

      }
    };
    tick();
    const interval = setInterval(tick, 500);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [activeTimer, db, publishTimer, serialize]);

  const setEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setEnabledState(value);
      if (!value) publishTimer(null);
      return serialize(async () => {
        await setSetting(db, ENABLED_KEY, String(value));
        if (!value) await replaceTimer(null, false);
      });
    },
    [db, publishTimer, replaceTimer, serialize]
  );

  const setDurationSeconds = useCallback(
    (seconds: number) =>
      serialize(async () => {
        if (!Number.isSafeInteger(seconds) || seconds < 15 || seconds > 600) {
          throw new Error('Elegí un descanso entre 15 segundos y 10 minutos.');
        }
        durationRef.current = seconds;
        setDurationState(seconds);
        await setSetting(db, DURATION_KEY, String(seconds));
      }),
    [db, serialize]
  );

  const startRest = useCallback(
    (sessionId: number, dayId: number, exerciseId: number, setIndex: number) => {
      if (!enabledRef.current) return Promise.resolve();
      const next: RestTimer = {
        sessionId,
        dayId,
        exerciseId,
        setIndex,
        expiresAt: Date.now() + durationRef.current * 1000,
        notificationId: null,
      };
      publishTimer(next);
      return serialize(() => replaceTimer(next, true));
    },
    [publishTimer, replaceTimer, serialize]
  );

  const extendRest = useCallback(
    () => {
      const current = activeRef.current;
      if (!current) return Promise.resolve();
      const next: RestTimer = { ...current, expiresAt: Math.max(Date.now(), current.expiresAt) + 30_000 };
      publishTimer(next);
      return serialize(() => replaceTimer(next, false));
    },
    [publishTimer, replaceTimer, serialize]
  );

  const skipRest = useCallback(
    (sessionId?: number, exerciseId?: number, setIndex?: number) => {
      const current = activeRef.current;
      if (sessionId !== undefined && current?.sessionId !== sessionId) return Promise.resolve();
      if (exerciseId !== undefined && (current?.exerciseId !== exerciseId || current?.setIndex !== setIndex)) return Promise.resolve();
      publishTimer(null);
      return serialize(() => replaceTimer(null, false));
    },
    [publishTimer, replaceTimer, serialize]
  );

  return (
    <RestTimerContext.Provider
      value={{
        enabled,
        durationSeconds,
        activeTimer,
        remainingSeconds,
        notificationsAllowed,
        permissionMessage,
        setEnabled,
        setDurationSeconds,
        startRest,
        extendRest,
        skipRest,
      }}>
      {children}
    </RestTimerContext.Provider>
  );
}

export function useRestTimer(): RestTimerContextValue {
  const value = useContext(RestTimerContext);
  if (!value) throw new Error('useRestTimer must be used within RestTimerProvider');
  return value;
}
