import type { RestAlerts, RestOpenData, RestPermission } from '@/platform/restAlertsTypes';

type Scheduled = { id: string; sessionId: number; dayId: number; timer: ReturnType<typeof setTimeout> };

const scheduled = new Map<string, Scheduled>();
const listeners = new Set<(data: RestOpenData) => void>();
let sequence = 0;
let audio: AudioContext | null = null;
let baseTitle = 'Rutina';

function notify(data: RestOpenData): void {
  for (const listener of listeners) listener(data);
}

function unlockAudio(): void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!audio) audio = new Ctx();
  if (audio.state === 'suspended') void audio.resume();
}

function showFallback(sessionId: number, dayId: number, id: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const notification = new Notification('Descanso terminado', {
    body: 'Ya podés continuar con tu entrenamiento.',
    tag: id,
    data: { sessionId, dayId, id },
  });
  notification.onclick = () => {
    window.focus();
    notify({ sessionId, dayId, id });
    notification.close();
  };
}

async function showNotification(sessionId: number, dayId: number, id: string): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) {
    await registration.showNotification('Descanso terminado', {
      body: 'Ya podés continuar con tu entrenamiento.',
      tag: id,
      data: { sessionId, dayId, id },
    });
    return;
  }
  showFallback(sessionId, dayId, id);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio);
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; sessionId?: number; dayId?: number; id?: string } | null;
    if (data?.type !== 'rest-open' || data.sessionId === undefined || data.dayId === undefined || !data.id) return;
    notify({ sessionId: Number(data.sessionId), dayId: Number(data.dayId), id: data.id });
  });
  void navigator.serviceWorker?.register('/sw.js').catch(() => undefined);
}

export const restAlerts: RestAlerts = {
  async permission(): Promise<RestPermission> {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'undetermined';
  },
  async requestPermission() {
    if (typeof Notification === 'undefined') return false;
    unlockAudio();
    const result = await Notification.requestPermission();
    return result === 'granted';
  },
  async schedule(timer) {
    const id = `rest-${Date.now().toString(36)}-${++sequence}`;
    const delay = Math.max(0, timer.fireAt - Date.now());
    const handle = setTimeout(() => {
      scheduled.delete(id);
      // El pitido con la pestaña visible lo emite RestTimerContext.
      void showNotification(timer.sessionId, timer.dayId, id);
    }, delay);
    scheduled.set(id, { id, sessionId: timer.sessionId, dayId: timer.dayId, timer: handle });
    return id;
  },
  async cancel(id) {
    if (!id) return;
    const current = scheduled.get(id);
    if (!current) return;
    clearTimeout(current.timer);
    scheduled.delete(id);
  },
  async listScheduled() {
    return [...scheduled.values()].map((item) => ({ id: item.id, sessionId: item.sessionId }));
  },
  onOpen(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  buzz() {
    unlockAudio();
    if (audio) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.05, audio.currentTime);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.18);
    }
    navigator.vibrate?.([0, 250, 200, 250]);
  },
  countdown(seconds) {
    if (typeof document === 'undefined') return;
    if (!baseTitle || document.title.includes('Descanso')) {
      // Conservar el título de la pantalla cuando no hay cuenta regresiva.
    }
    if (seconds === null) {
      document.title = baseTitle;
      return;
    }
    if (!document.title.includes('Descanso')) baseTitle = document.title || 'Rutina';
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    document.title = `${minutes}:${String(rest).padStart(2, '0')} · Descanso · Rutina`;
  },
};
