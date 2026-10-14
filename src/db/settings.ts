import type { SQLiteDatabase } from 'expo-sqlite';
import { serializeWrite } from '@/db/writes';

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await serializeWrite(db, () => db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value));
}
