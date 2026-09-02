import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 1;

const MIGRATION_0 = `
CREATE TABLE IF NOT EXISTS days (
  id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  day_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  sort INTEGER NOT NULL,
  FOREIGN KEY (day_id) REFERENCES days (id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  day_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  completed_sets TEXT NOT NULL,
  FOREIGN KEY (day_id) REFERENCES days (id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_day_open ON sessions (day_id, completed_at);
`;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let current = result?.user_version ?? 0;
    if (current >= DATABASE_VERSION) return;
    if (current === 0) {
      await db.execAsync(MIGRATION_0);
      current = 1;
    }
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}

export async function resetAndMigrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS exercises;
    DROP TABLE IF EXISTS days;
    PRAGMA user_version = 0;
  `);
  await migrate(db);
}
