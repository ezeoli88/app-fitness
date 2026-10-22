import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';

import type { RestAlerts, RestOpenData, RestPermission } from '@/platform/restAlertsTypes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureRestChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('rest-timer', {
    name: 'Descanso entre series',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 250, 200, 250],
  });
}

function parseResponse(response: Notifications.NotificationResponse): RestOpenData | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const data = response.notification.request.content.data;
  if (data?.kind !== 'rest-timer') return null;
  const sessionId = Number(data.sessionId);
  const dayId = Number(data.dayId);
  if (!Number.isFinite(sessionId) || !Number.isFinite(dayId)) return null;
  return { sessionId, dayId, id: response.notification.request.identifier };
}

export const restAlerts: RestAlerts = {
  async permission(): Promise<RestPermission> {
    await ensureRestChannel();
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.granted) return 'granted';
    if (permissions.canAskAgain === false) return 'denied';
    return 'undetermined';
  },
  async requestPermission() {
    await ensureRestChannel();
    return Boolean((await Notifications.requestPermissionsAsync()).granted);
  },
  async schedule(timer) {
    const seconds = Math.max(1, Math.ceil((timer.fireAt - Date.now()) / 1000));
    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'Descanso terminado',
        body: 'Ya podés continuar con tu entrenamiento.',
        data: { kind: 'rest-timer', sessionId: timer.sessionId, dayId: timer.dayId },
        ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
      },
    });
  },
  async cancel(id) {
    if (!id) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
      await Notifications.dismissNotificationAsync(id);
    } catch {
      // El sistema puede haber entregado o descartado el aviso.
    }
  },
  async listScheduled() {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.flatMap((item) => {
      const data = item.content.data;
      if (data?.kind !== 'rest-timer') return [];
      const sessionId = Number(data.sessionId);
      if (!Number.isFinite(sessionId)) return [];
      return [{ id: item.identifier, sessionId }];
    });
  },
  onOpen(cb) {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const parsed = parseResponse(response);
      if (parsed) cb(parsed);
    });
    void Notifications.getLastNotificationResponseAsync?.().then((response) => {
      if (!response) return;
      const parsed = parseResponse(response);
      if (parsed) cb(parsed);
    }).catch(() => undefined);
    return () => subscription.remove();
  },
  buzz() {
    Vibration.vibrate([0, 250, 200, 250]);
  },
  countdown() {
    // El contador en el título es solo para la pestaña del navegador.
  },
};
