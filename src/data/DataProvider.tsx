import { useCallback, useMemo, useState, type ReactNode } from 'react';
import * as SQLite from 'expo-sqlite';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import { DataContextProvider } from '@/data/context';
import catalogJson from '@/data/routines.json';
import type { AppData } from '@/data/types';
import { createExpoDriver } from '@/db/core/expoDriver';
import { createGymDb } from '@/db/gymDb';
import { DATABASE_VERSION, migrate } from '@/db/schema';
import { seedCatalog } from '@/db/seed';
import { createSqlSettings } from '@/db/settings';
import type { RoutineJson } from '@/domain/types';

const catalog = catalogJson as RoutineJson[];
const BACKUP_NAME = 'rutina-antes-de-migrar-v5.db';

async function backUpBeforeMigration(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (!result || result.user_version >= DATABASE_VERSION) return;
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
  );
  if (tables.length === 0) return;
  const backup = await SQLite.openDatabaseAsync(BACKUP_NAME);
  try {
    await SQLite.backupDatabaseAsync({ sourceDatabase: db, destDatabase: backup });
  } finally {
    await backup.closeAsync();
  }
}

function NativeBridge({
  databaseError,
  retry,
  children,
}: {
  databaseError: string | null;
  retry: () => void;
  children: ReactNode;
}) {
  const db = useSQLiteContext();
  const value = useMemo<AppData>(() => {
    const driver = createExpoDriver(db);
    return { gym: createGymDb(driver), settings: createSqlSettings(driver), databaseError, retry };
  }, [databaseError, db, retry]);
  return <DataContextProvider value={value}>{children}</DataContextProvider>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const onInit = useCallback(async (db: SQLiteDatabase) => {
    try {
      await backUpBeforeMigration(db);
      await db.execAsync('PRAGMA foreign_keys = ON');
      await migrate(db);
      await seedCatalog(createExpoDriver(db), catalog);
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
      <NativeBridge databaseError={databaseError} retry={retry}>
        {children}
      </NativeBridge>
    </SQLiteProvider>
  );
}

export { useData } from '@/data/context';
