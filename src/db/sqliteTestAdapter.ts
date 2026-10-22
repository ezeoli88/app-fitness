import type { SQLiteDatabase } from 'expo-sqlite';

import { openNodeSqlite } from '@/db/core/nodeDriver';

/** Superficie async de expo-sqlite sobre node:sqlite, para migraciones y el contrato. */
export function createSqliteTestAdapter(): {
  db: SQLiteDatabase;
  driver: ReturnType<typeof openNodeSqlite>['driver'];
  close: () => void;
} {
  const opened = openNodeSqlite();
  return { db: opened.db, driver: opened.driver, close: opened.close };
}
