import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmHost } from '@/components/ConfirmHost';
import { SessionExpiredBanner } from '@/components/SessionExpiredBanner';
import { useLayout } from '@/components/useLayout';
import { DataProvider, useData } from '@/data/DataProvider';
import { GymProvider, useGym } from '@/db/GymContext';
import { RestTimerProvider, useRestTimer } from '@/db/RestTimerContext';
import { hideSplash } from '@/platform/splash';
import { restAlerts } from '@/platform/restAlerts';
import { ThemeProvider, useTheme } from '@/ThemeContext';

import '@/platform/splash';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  useEffect(() => { hideSplash(); }, []);
  return (
    <View style={[styles.recovery, { backgroundColor: '#080d14' }]}>
      <Text style={[styles.recoveryTitle, { color: '#ffffff' }]}>No pudimos iniciar Rutina</Text>
      <Text style={[styles.recoveryBody, { color: '#aab7c8' }]}>Tus datos no se borraron. Podés volver a intentar abrir la app.</Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()} style={[styles.retry, { backgroundColor: '#ffdf45' }]}>
        <Text style={styles.retryText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

function RestTimerBanner() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { wide } = useLayout();
  const { activeTimer, remainingSeconds, extendRest, skipRest } = useRestTimer();
  const { colors } = useTheme();
  const onSession = /^\/session\/[^/]+$/.test(pathname);
  if (!activeTimer || (wide && onSession)) return null;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.timerBanner,
        wide ? styles.timerWide : null,
        { bottom: Math.max(14, insets.bottom), backgroundColor: colors.card, borderColor: colors.lastBorder },
      ]}>
      <View style={styles.timerText}>
        <Text style={[styles.timerKicker, { color: colors.muted }]}>DESCANSO</Text>
        <Text style={[styles.timerValue, { color: colors.text }]}>
          {minutes}:{String(seconds).padStart(2, '0')}
        </Text>
      </View>
      <Pressable onPress={() => void extendRest()} accessibilityRole="button" accessibilityLabel="Extender descanso 30 segundos">
        <Text style={[styles.timerAction, { color: colors.brass }]}>+30 s</Text>
      </Pressable>
      <Pressable onPress={() => void skipRest()} accessibilityRole="button" accessibilityLabel="Omitir descanso">
        <Text style={[styles.timerAction, { color: colors.brass }]}>Omitir</Text>
      </Pressable>
    </View>
  );
}

function RestNotificationNavigation() {
  const router = useRouter();
  const gym = useGym();
  const { settings } = useData();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => restAlerts.onOpen((data) => {
    if (lastHandled.current === data.id) return;
    lastHandled.current = data.id;
    void (async () => {
      try {
        const previous = await settings.get('lastConsumedRestNotification');
        if (previous === data.id) return;
        const details = await gym.getSessionDetails(data.sessionId);
        if (!details) return;
        if (details.status === 'open') router.push(`/session/${details.dayId}`);
        else router.push(`/session-detail/${details.id}`);
        await settings.set('lastConsumedRestNotification', data.id);
      } catch {
        lastHandled.current = null;
      }
    })();
  }), [gym, router, settings]);

  return null;
}

function DatabaseRecovery({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.recovery, { backgroundColor: colors.bg }]}>
      <Text style={[styles.recoveryTitle, { color: colors.text }]}>No pudimos abrir tus datos</Text>
      <Text style={[styles.recoveryBody, { color: colors.muted }]}>
        La app no borró tus datos. Probá inicializarla otra vez.
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={[styles.retry, { backgroundColor: colors.chalk }]}>
        <Text style={[styles.retryText, { color: colors.bg }]}>Reintentar</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function ThemedShell() {
  const { theme, colors } = useTheme();
  const { databaseError, retry } = useData();

  useEffect(() => { hideSplash(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {databaseError ? (
        <DatabaseRecovery onRetry={retry} />
      ) : (
        <RestTimerProvider>
          <GymProvider>
            <RestNotificationNavigation />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}>
              <Stack.Screen name="index" options={{ title: 'Entrenar' }} />
              <Stack.Screen name="routines" options={{ title: 'Rutinas' }} />
              <Stack.Screen name="rest-settings" options={{ title: 'Descanso' }} />
              <Stack.Screen name="history" options={{ title: 'Historial' }} />
              <Stack.Screen name="session/[dayId]" options={{ title: 'Sesión' }} />
              <Stack.Screen name="session-detail/[sessionId]" options={{ title: 'Detalle' }} />
              <Stack.Screen name="routine-editor/[routineId]" options={{ title: 'Editor' }} />
            </Stack>
            <RestTimerBanner />
            <ConfirmHost />
            <SessionExpiredBanner />
          </GymProvider>
        </RestTimerProvider>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <DataProvider>
      <ThemeProvider>
        <ThemedShell />
      </ThemeProvider>
    </DataProvider>
  );
}

const styles = StyleSheet.create({
  timerBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    elevation: 8,
  },
  timerWide: { left: undefined, right: 24, width: 360 },
  timerText: { flex: 1 },
  timerKicker: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  timerValue: { fontSize: 20, fontWeight: '700', marginTop: 1 },
  timerAction: { fontSize: 14, fontWeight: '700', paddingVertical: 8 },
  recovery: { flex: 1, padding: 28, justifyContent: 'center' },
  recoveryTitle: { fontSize: 24, fontWeight: '700' },
  recoveryBody: { fontSize: 15, lineHeight: 23, marginTop: 12 },
  retry: { marginTop: 22, borderRadius: 15, alignItems: 'center', paddingVertical: 14 },
  retryText: { fontSize: 15, fontWeight: '700' },
});
