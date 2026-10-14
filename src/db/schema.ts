import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 4;

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

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

const MIGRATION_2 = `
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  sort INTEGER NOT NULL
);
ALTER TABLE days ADD COLUMN routine_id TEXT NOT NULL DEFAULT 'principiantes';
INSERT INTO routines (id, title, level, sort)
SELECT 'principiantes', 'Principiantes', 'principiante', 0
WHERE EXISTS (SELECT 1 FROM days)
  AND NOT EXISTS (SELECT 1 FROM routines WHERE id = 'principiantes');
`;

const MIGRATION_3 = `
ALTER TABLE routines ADD COLUMN archived_at TEXT;
ALTER TABLE days ADD COLUMN archived_at TEXT;
ALTER TABLE exercises ADD COLUMN archived_at TEXT;
ALTER TABLE sessions ADD COLUMN routine_id TEXT NOT NULL DEFAULT 'principiantes';
ALTER TABLE sessions ADD COLUMN routine_title TEXT NOT NULL DEFAULT 'Principiantes';
ALTER TABLE sessions ADD COLUMN day_title TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'open';

CREATE TABLE session_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  session_id INTEGER NOT NULL,
  source_exercise_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  sort INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);
CREATE INDEX idx_session_exercises_session ON session_exercises (session_id, sort);

CREATE TABLE session_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  session_exercise_id INTEGER NOT NULL,
  set_index INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  weight_kg REAL,
  actual_reps INTEGER,
  FOREIGN KEY (session_exercise_id) REFERENCES session_exercises (id) ON DELETE CASCADE,
  UNIQUE (session_exercise_id, set_index)
);
CREATE INDEX idx_session_sets_exercise ON session_sets (session_exercise_id, set_index);
`;

function parseLegacySets(raw: string): Record<number, boolean[]> {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        Number(key),
        Array.isArray(value) ? value.map(Boolean) : [],
      ])
    );
  } catch {
    return {};
  }
}

async function backfillSessionSnapshots(db: SQLiteDatabase): Promise<void> {
  const sessions = await db.getAllAsync<{
    id: number;
    day_id: number;
    completed_at: string | null;
    completed_sets: string;
  }>('SELECT id, day_id, completed_at, completed_sets FROM sessions');

  for (const session of sessions) {
    const day = await db.getFirstAsync<{ id: number; routine_id: string; title: string }>(
      'SELECT id, routine_id, title FROM days WHERE id = ?',
      session.day_id
    );
    if (!day) continue;

    const routine = await db.getFirstAsync<{ title: string }>(
      'SELECT title FROM routines WHERE id = ?',
      day.routine_id
    );
    const exercises = await db.getAllAsync<{
      id: number;
      name: string;
      sets: number;
      reps: number;
      sort: number;
    }>(
      'SELECT id, name, sets, reps, sort FROM exercises WHERE day_id = ? ORDER BY sort ASC',
      day.id
    );

    await db.runAsync(
      `UPDATE sessions
       SET routine_id = ?, routine_title = ?, day_title = ?, status = ?
       WHERE id = ?`,
      day.routine_id,
      routine?.title ?? 'Principiantes',
      day.title,
      session.completed_at ? 'completed' : 'open',
      session.id
    );

    const marks = parseLegacySets(session.completed_sets);
    // A catalog may have changed since the old session: retain every recorded mark.
    for (const [id, series] of Object.entries(marks)) {
      const sourceId = Number(id);
      if (!Number.isSafeInteger(sourceId) || series.length === 0) continue;
      if (!exercises.some((exercise) => exercise.id === sourceId)) {
        exercises.push({ id: sourceId, name: 'Ejercicio anterior', sets: series.length, reps: 0, sort: exercises.length });
      }
    }
    let completedCount = 0;
    let totalCount = 0;
    for (const exercise of exercises) {
      const oldMarks = marks[exercise.id] ?? [];
      const sets = Math.max(exercise.sets, oldMarks.length);
      const result = await db.runAsync(
        `INSERT INTO session_exercises
           (session_id, source_exercise_id, name, sets, reps, sort)
         VALUES (?, ?, ?, ?, ?, ?)`,
        session.id,
        exercise.id,
        exercise.name,
        sets,
        exercise.reps,
        exercise.sort
      );
      const exerciseId = result.lastInsertRowId;
      for (let setIndex = 0; setIndex < sets; setIndex++) {
        totalCount++;
        if (oldMarks[setIndex]) completedCount++;
        await db.runAsync(
          `INSERT INTO session_sets (session_exercise_id, set_index, completed)
           VALUES (?, ?, ?)`,
          exerciseId,
          setIndex,
          oldMarks[setIndex] ? 1 : 0
        );
      }
    }
    if (session.completed_at && completedCount < totalCount) {
      await db.runAsync("UPDATE sessions SET status = 'partial' WHERE id = ?", session.id);
    }
  }
}

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let current = result?.user_version ?? 0;
    if (current >= DATABASE_VERSION) return;
    if (current === 0) {
      await db.execAsync(MIGRATION_0);
      current = 1;
    }
    if (current === 1) {
      await db.execAsync(MIGRATION_1);
      current = 2;
    }
    if (current === 2) {
      await db.execAsync(MIGRATION_2);
      current = 3;
    }
    if (current === 3) {
      await db.execAsync(MIGRATION_3);
      await backfillSessionSnapshots(db);
      current = 4;
    }
    await db.execAsync(`PRAGMA user_version = ${current}`);
  });
}
