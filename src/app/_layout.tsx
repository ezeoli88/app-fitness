import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { GymProvider } from '@/db/GymContext';
import { RecoveredContext } from '@/db/RecoveredContext';
import { migrate, resetAndMigrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import routineJson from '@/data/rutina.json';
import type { RoutineJson } from '@/domain/types';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const routine = routineJson as RoutineJson;

function HideSplash() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

export default function RootLayout() {
  const [recovered, setRecovered] = useState(false);

  const onInit = useCallback(async (db: SQLiteDatabase) => {
    try {
      await migrate(db);
      await seedIfEmpty(db, routine);
    } catch {
      await resetAndMigrate(db);
      await seedIfEmpty(db, routine);
      setRecovered(true);
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <SQLiteProvider databaseName="rutina.db" onInit={onInit}>
        <RecoveredContext.Provider value={recovered}>
          <GymProvider>
            <HideSplash />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            />
          </GymProvider>
        </RecoveredContext.Provider>
      </SQLiteProvider>
    </View>
  );
}
