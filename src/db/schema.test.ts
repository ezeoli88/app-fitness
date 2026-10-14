/** @jest-environment node */

import { createSqliteTestAdapter } from '@/db/sqliteTestAdapter';
import { DATABASE_VERSION, migrate } from '@/db/schema';

describe('SQLite migration v3 → v4', () => {
  it('rolls back a failed migration and allows retry without deleting user data', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await db.execAsync("CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES ('keep');");
      const original = db.execAsync.bind(db);
      const fail = jest.spyOn(db, 'execAsync').mockImplementation(async (sql) => {
        if (sql.includes('ALTER TABLE routines')) throw new Error('Injected disk failure');
        await original(sql);
      });
      await expect(migrate(db)).rejects.toThrow('Injected disk failure');
      expect(await db.getFirstAsync('SELECT value FROM sentinel')).toEqual({ value: 'keep' });
      expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 0 });
      fail.mockRestore();
      await migrate(db);
      expect(await db.getFirstAsync('SELECT value FROM sentinel')).toEqual({ value: 'keep' });
    } finally { close(); }
  });
  it('preserves session IDs, dates, settings, progress and rebuilds snapshots exactly once', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await db.execAsync(`
        CREATE TABLE routines (id TEXT PRIMARY KEY, title TEXT NOT NULL, level TEXT NOT NULL, sort INTEGER NOT NULL);
        CREATE TABLE days (id INTEGER PRIMARY KEY, title TEXT NOT NULL, sort INTEGER NOT NULL, routine_id TEXT NOT NULL);
        CREATE TABLE exercises (id INTEGER PRIMARY KEY, day_id INTEGER NOT NULL, name TEXT NOT NULL, sets INTEGER NOT NULL, reps INTEGER NOT NULL, sort INTEGER NOT NULL);
        CREATE TABLE sessions (id INTEGER PRIMARY KEY, day_id INTEGER NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, completed_sets TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO routines VALUES ('personal', 'Mi rutina', 'personalizada', 0);
        INSERT INTO days VALUES (12, 'Día A', 0, 'personal');
        INSERT INTO exercises VALUES (35, 12, 'Sentadilla', 3, 8, 0);
        INSERT INTO sessions VALUES (81, 12, '2026-01-02T10:00:00.000Z', '2026-01-02T10:40:00.000Z', '{"35":[true,false,true]}');
        INSERT INTO sessions VALUES (82, 12, '2026-01-03T10:00:00.000Z', NULL, '{"35":[true,false,false]}');
        INSERT INTO settings VALUES ('theme', 'light');
        INSERT INTO settings VALUES ('activeRoutineId', 'personal');
        PRAGMA user_version = 3;
      `);
      await db.execAsync('PRAGMA foreign_keys = ON');

      await migrate(db);

      expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(DATABASE_VERSION);
      expect(await db.getFirstAsync<{ started_at: string; completed_at: string | null; status: string }>(
        'SELECT started_at, completed_at, status FROM sessions WHERE id = 81'
      )).toEqual({ started_at: '2026-01-02T10:00:00.000Z', completed_at: '2026-01-02T10:40:00.000Z', status: 'partial' });
      expect(await db.getFirstAsync<{ status: string; routine_title: string; day_title: string }>(
        'SELECT status, routine_title, day_title FROM sessions WHERE id = 82'
      )).toEqual({ status: 'open', routine_title: 'Mi rutina', day_title: 'Día A' });
      expect(await db.getAllAsync<{ completed: number; weight_kg: number | null; actual_reps: number | null }>(
        'SELECT completed, weight_kg, actual_reps FROM session_sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = 81) ORDER BY set_index'
      )).toEqual([
        { completed: 1, weight_kg: null, actual_reps: null },
        { completed: 0, weight_kg: null, actual_reps: null },
        { completed: 1, weight_kg: null, actual_reps: null },
      ]);
      expect(await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'theme'")).toEqual({ value: 'light' });

      await migrate(db);
      expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sessions')).toEqual({ count: 2 });
      expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM session_exercises')).toEqual({ count: 2 });
      expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM session_sets')).toEqual({ count: 6 });
    } finally {
      close();
    }
  });

  it('creates the current schema on a fresh database and is safe to run again', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await migrate(db);
      await migrate(db);
      expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(4);
      expect(await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_sets'"
      )).toEqual({ name: 'session_sets' });
    } finally {
      close();
    }
  });

  it('upgrades the v1 database used by existing installs without losing its session history', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await db.execAsync(`
        CREATE TABLE days (id INTEGER PRIMARY KEY NOT NULL, title TEXT NOT NULL, sort INTEGER NOT NULL);
        CREATE TABLE exercises (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, day_id INTEGER NOT NULL, name TEXT NOT NULL, sets INTEGER NOT NULL, reps INTEGER NOT NULL, sort INTEGER NOT NULL);
        CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, day_id INTEGER NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, completed_sets TEXT NOT NULL);
        INSERT INTO days VALUES (4, 'Rutina guardada', 0);
        INSERT INTO exercises VALUES (9, 4, 'Press', 2, 12, 0);
        INSERT INTO sessions VALUES (14, 4, '2026-02-01T08:00:00.000Z', '2026-02-01T08:20:00.000Z', '{"9":[true,false]}');
        PRAGMA user_version = 1;
      `);

      await migrate(db);

      expect(await db.getFirstAsync<{ id: number; status: string; routine_title: string; day_title: string }>(
        'SELECT id, status, routine_title, day_title FROM sessions WHERE id = 14'
      )).toEqual({ id: 14, status: 'partial', routine_title: 'Principiantes', day_title: 'Rutina guardada' });
      expect(await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM session_sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = 14) AND completed = 1'
      )).toEqual({ count: 1 });
      expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(4);
    } finally {
      close();
    }
  });
});
