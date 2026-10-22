import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useData } from '@/data/DataProvider';
import type { RestTimer } from '@/domain/types';
import { restAlerts } from '@/platform/restAlerts';

const ENABLED_KEY = 'restEnabled';
const DURATION_KEY = 'restDurationSeconds';
const ACTIVE_KEY = 'activeRestTimer';
const ASKED_KEY = 'restPermissionRequested';

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
  requestNotificationPermission(): Promise<void>;
};

const RestTimerContext = createContext<RestTimerContextValue | null>(null);

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const { settings, gym } = useData();
  const [enabled, setEnabledState] = useState(true);
  const [durationSeconds, setDurationState] = useState(90);
  const [activeTimer, setActiveTimer] = useState<RestTimer | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [notificationsAllowed, setNotificationsAllowed] = useState<boolean | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const activeRef = useRef<RestTimer | null>(null);
  const enabledRef = useRef(true);
  const durationRef = useRef(90);
  const askedRef = useRef(false);
  const pendingPermission = useRef<Promise<boolean> | null>(null);
  const didBuzz = useRef<number | null>(null);
  const scheduledId = useRef<string | null>(null);
  const operation = useRef<Promise<unknown>>(Promise.resolve());

  const serialize = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = operation.current.catch(() => undefined).then(task);
    operation.current = next.catch(() => undefined);
    return next;
  }, []);

  const publishTimer = useCallback((next: RestTimer | null) => {
    activeRef.current = next;
    setActiveTimer(next);
    const left = next ? Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)) : 0;
    setRemainingSeconds(left);
    restAlerts.countdown(next ? left : null);
    didBuzz.current = null;
  }, []);

  const replaceTimer = useCallback(
    async (next: RestTimer | null, requestPermission: boolean) => {
      const previousId = scheduledId.current;
      scheduledId.current = null;
      await restAlerts.cancel(previousId);
      if (activeRef.current !== next) return;
      if (!next) {
        await settings.set(ACTIVE_KEY, '');
        restAlerts.countdown(null);
        return;
      }

      let notificationId: string | null = null;
      let allowed = false;
      try {
        const asked = await settings.get(ASKED_KEY);
        const ask = requestPermission && asked !== 'true';
        if (ask) {
          askedRef.current = true;
          await settings.set(ASKED_KEY, 'true');
        }
        const status = await restAlerts.permission();
        allowed = status === 'granted';
        if (!allowed && ask && status === 'undetermined') {
          const pending = pendingPermission.current;
          pendingPermission.current = null;
          allowed = pending ? await pending : await restAlerts.requestPermission();
        }
      } catch { /* El contador funciona sin avisos. */ }
      if (activeRef.current !== next) return;
      if (allowed) {
        try {
          notificationId = await restAlerts.schedule({
            sessionId: next.sessionId,
            dayId: next.dayId,
            fireAt: next.expiresAt,
          });
          setNotificationsAllowed(true);
          setPermissionMessage(null);
        } catch {
          setNotificationsAllowed(false);
          setPermissionMessage('El aviso del navegador no está disponible. El contador sigue en esta pestaña.');
        }
      } else {
        setNotificationsAllowed(false);
        setPermissionMessage('Activá los avisos del navegador para enterarte cuando termine el descanso. Con la pestaña en segundo plano pueden atrasarse, y si cerrás el navegador no hay aviso.');
      }

      const persisted = { ...next, notificationId };
      scheduledId.current = notificationId;
      await settings.set(ACTIVE_KEY, JSON.stringify(persisted));
      if (activeRef.current === next) publishTimer(persisted);
    },
    [publishTimer, settings]
  );

  useEffect(() => {
    let mounted = true;
    void serialize(async () => {
      try {
        const [enabledValue, durationValue, rawTimer, permission] = await Promise.all([
          settings.get(ENABLED_KEY),
          settings.get(DURATION_KEY),
          settings.get(ACTIVE_KEY),
          restAlerts.permission().catch(() => 'denied' as const),
        ]);
        const asked = await settings.get(ASKED_KEY);
        askedRef.current = asked === 'true';
        if (!mounted) return;
        enabledRef.current = enabledValue !== 'false';
        setEnabledState(enabledRef.current);
        const parsedDuration = Number(durationValue);
        if (Number.isSafeInteger(parsedDuration) && parsedDuration >= 15 && parsedDuration <= 600) {
          durationRef.current = parsedDuration;
          setDurationState(parsedDuration);
        }
        setNotificationsAllowed(permission === 'granted');
        const listed = await restAlerts.listScheduled().catch(() => []);
        let parsed: RestTimer | null = null;
        try { parsed = rawTimer ? JSON.parse(rawTimer) as RestTimer : null; } catch { /* Temporizador inválido. */ }
        const origin = parsed
          ? await gym.getSetState(parsed.sessionId, parsed.exerciseId, parsed.setIndex ?? -1)
          : null;
        const valid = Boolean(parsed && enabledRef.current && Number.isFinite(parsed.expiresAt) && parsed.expiresAt > Date.now() && origin?.status === 'open' && origin.completed);
        for (const notification of listed) {
          if (!valid || notification.id !== parsed?.notificationId) await restAlerts.cancel(notification.id);
        }
        if (!valid || !parsed) {
          await settings.set(ACTIVE_KEY, '');
          return;
        }
        let notificationId = parsed.notificationId ?? null;
        if (permission === 'granted') {
          const stillScheduled = listed.some((item) => item.id === notificationId);
          if (!stillScheduled) {
            notificationId = await restAlerts.schedule({
              sessionId: parsed.sessionId,
              dayId: parsed.dayId,
              fireAt: parsed.expiresAt,
            }).catch(() => null);
          }
        }
        const restored = { ...parsed, notificationId };
        await settings.set(ACTIVE_KEY, JSON.stringify(restored));
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
  }, [gym, publishTimer, serialize, settings]);

  useEffect(() => {
    if (!activeTimer) return;
    const tick = () => {
      if (AppState.currentState !== 'active' || activeRef.current !== activeTimer) return;
      const left = Math.max(0, Math.ceil((activeTimer.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      restAlerts.countdown(left > 0 ? left : null);
      if (left === 0 && didBuzz.current !== activeTimer.expiresAt) {
        didBuzz.current = activeTimer.expiresAt;
        restAlerts.buzz();
        void serialize(async () => {
          if (activeRef.current !== activeTimer) return;
          await settings.set(ACTIVE_KEY, '');
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
  }, [activeTimer, publishTimer, serialize, settings]);

  const setEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setEnabledState(value);
      if (!value) publishTimer(null);
      return serialize(async () => {
        await settings.set(ENABLED_KEY, String(value));
        if (!value) await replaceTimer(null, false);
      });
    },
    [publishTimer, replaceTimer, serialize, settings]
  );

  const setDurationSeconds = useCallback(
    (seconds: number) =>
      serialize(async () => {
        if (!Number.isSafeInteger(seconds) || seconds < 15 || seconds > 600) {
          throw new Error('Elegí un descanso entre 15 segundos y 10 minutos.');
        }
        durationRef.current = seconds;
        setDurationState(seconds);
        await settings.set(DURATION_KEY, String(seconds));
      }),
    [serialize, settings]
  );

  const startRest = useCallback(
    (sessionId: number, dayId: number, exerciseId: number, setIndex: number) => {
      if (!enabledRef.current) return Promise.resolve();
      if (!askedRef.current) {
        askedRef.current = true;
        pendingPermission.current = restAlerts.requestPermission();
        void settings.set(ASKED_KEY, 'true');
      }
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
    [publishTimer, replaceTimer, serialize, settings]
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

  const requestNotificationPermission = useCallback(
    () => serialize(async () => {
      askedRef.current = true;
      await settings.set(ASKED_KEY, 'true');
      const granted = await restAlerts.requestPermission();
      setNotificationsAllowed(granted);
      setPermissionMessage(granted
        ? null
        : 'Habilitá las notificaciones en la configuración del sitio del navegador.');
    }),
    [serialize, settings]
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
        requestNotificationPermission,
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
