import { Stack, useRouter, type ErrorBoundaryProps } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/ThemeContext';
import { useLastNotificationResponse } from 'expo-notifications';
import { GymProvider, useGym } from '@/db/GymContext';
import { getSetting, setSetting } from '@/db/settings';
import { RestTimerProvider, useRestTimer } from '@/db/RestTimerContext';
import { migrate, DATABASE_VERSION } from '@/db/schema';
import { seedCatalog } from '@/db/seed';
import catalogJson from '@/data/routines.json';
import type { RoutineJson } from '@/domain/types';

SplashScreen.preventAutoHideAsync();

const catalog = catalogJson as RoutineJson[];
const BACKUP_NAME = 'rutina-antes-de-migrar-v4.db';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
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

async function backUpBeforeMigration(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (!result || result.user_version >= DATABASE_VERSION) return;
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
  );
  if (tables.length === 0) return;
  const backup = await SQLite.openDatabaseAsync(BACKUP_NAME);
  try {
    await SQLite.backupDatabaseAsync({
      sourceDatabase: db,
      destDatabase: backup,
    });
  } finally {
    await backup.closeAsync();
  }
}

function RestTimerBanner() {
  const insets = useSafeAreaInsets();
  const { activeTimer, remainingSeconds, extendRest, skipRest } = useRestTimer();
  const { colors } = useTheme();
  if (!activeTimer) return null;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.timerBanner, { bottom: Math.max(14, insets.bottom), backgroundColor: colors.card, borderColor: colors.lastBorder }]}>
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
  const response = useLastNotificationResponse();
  const router = useRouter();
  const gym = useGym();
  const db = useSQLiteContext();
  const lastHandled = useRef<string | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const request = response.notification.request;
    const data = request.content.data;
    if (data?.kind !== 'rest-timer' || lastHandled.current === request.identifier) return;
    lastHandled.current = request.identifier;
    void (async () => {
      try {
        const previous = await getSetting(db, 'lastConsumedRestNotification');
        if (previous === request.identifier) return;
        const details = await gym.getSessionDetails(Number(data.sessionId));
        if (!details) return;
        if (details.status === 'open') router.push(`/session/${details.dayId}`);
        else router.push(`/session-detail/${details.id}`);
        await setSetting(db, 'lastConsumedRestNotification', request.identifier);
      } catch {
        // Keep the notification tappable on the next app open if the database is unavailable.
        lastHandled.current = null;
      }
    })();
  }, [db, response, router, gym]);

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

function ThemedShell({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { theme, colors } = useTheme();

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {error ? (
        <DatabaseRecovery onRetry={onRetry} />
      ) : (
        <RestTimerProvider>
          <GymProvider>
            <RestNotificationNavigation />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            />
            <RestTimerBanner />
          </GymProvider>
        </RestTimerProvider>
      )}
    </View>
  );
}

export default function RootLayout() {
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const onInit = useCallback(async (db: SQLiteDatabase) => {
    try {
      await backUpBeforeMigration(db);
      await db.execAsync('PRAGMA foreign_keys = ON');
      await migrate(db);
      await seedCatalog(db, catalog);
      setDatabaseError(null);
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : 'Falló la inicialización de SQLite.');
    }
  }, []);

  const retry = useCallback(() => {
    setDatabaseError(null);
    setAttempt((value) => value + 1);
  }, []);

  return (
    <SQLiteProvider key={attempt} databaseName="rutina.db" onInit={onInit}>
      <ThemeProvider>
        <ThemedShell error={databaseError} onRetry={retry} />
      </ThemeProvider>
    </SQLiteProvider>
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
