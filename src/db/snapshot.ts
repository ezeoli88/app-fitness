import type { SqlDriver, Stmt } from '@/db/core/driver';
import { isUniqueConstraint } from '@/db/core/driver';
import { isSyncSettingKey } from '@/db/settings';
import { DomainError } from '@/domain/errors';

export type TrainingSnapshot = {
  routines: { id: string; title: string; level: string; sort: number; archivedAt?: string | null }[];
  days: { uid: string; routineId: string; title: string; sort: number; archivedAt?: string | null }[];
  exercises: {
    uid: string;
    dayUid: string;
    name: string;
    sets: number;
    reps: number;
    sort: number;
    archivedAt?: string | null;
  }[];
  sessions: {
    uid: string;
    dayUid: string;
    startedAt: string;
    completedAt: string | null;
    status: 'open' | 'completed' | 'partial';
    routineId: string;
    routineTitle: string;
    dayTitle: string;
    lastUsedAt: string | null;
  }[];
  sessionExercises: {
    uid: string;
    sessionUid: string;
    sourceExerciseUid: string | null;
    name: string;
    sets: number;
    reps: number;
    sort: number;
  }[];
  sessionSets: {
    uid: string;
    sessionExerciseUid: string;
    setIndex: number;
    completed: boolean;
    weightKg: number | null;
    actualReps: number | null;
  }[];
  settings?: { key: string; value: string }[];
};

/** Importa una instantánea en una base vacía. Dos sesiones abiertas del mismo día fallan juntas. */
export async function importSnapshot(driver: SqlDriver, snapshot: TrainingSnapshot): Promise<void> {
  const count = await driver.first<{ n: number }>('SELECT COUNT(*) AS n FROM routines');
  if ((count?.n ?? 0) > 0) throw new DomainError('La base ya tiene datos.', 409);

  const stmts: Stmt[] = [];
  for (const routine of snapshot.routines) {
    stmts.push({
      sql: 'INSERT INTO routines (id, title, level, sort, archived_at) VALUES (?, ?, ?, ?, ?)',
      params: [routine.id, routine.title, routine.level, routine.sort, routine.archivedAt ?? null],
    });
  }
  for (const day of snapshot.days) {
    stmts.push({
      sql: 'INSERT INTO days (uid, routine_id, title, sort, archived_at) VALUES (?, ?, ?, ?, ?)',
      params: [day.uid, day.routineId, day.title, day.sort, day.archivedAt ?? null],
    });
  }
  for (const exercise of snapshot.exercises) {
    stmts.push({
      sql: `INSERT INTO exercises (uid, day_id, name, sets, reps, sort, archived_at)
            VALUES (?, (SELECT id FROM days WHERE uid = ?), ?, ?, ?, ?, ?)`,
      params: [
        exercise.uid,
        exercise.dayUid,
        exercise.name,
        exercise.sets,
        exercise.reps,
        exercise.sort,
        exercise.archivedAt ?? null,
      ],
    });
  }
  for (const session of snapshot.sessions) {
    stmts.push({
      sql: `INSERT INTO sessions
              (uid, day_id, started_at, completed_at, completed_sets, status, routine_id, routine_title, day_title, last_used_at)
            SELECT ?, id, ?, ?, '{}', ?, ?, ?, ?, ?
            FROM days WHERE uid = ?`,
      params: [
        session.uid,
        session.startedAt,
        session.completedAt,
        session.status,
        session.routineId,
        session.routineTitle,
        session.dayTitle,
        session.lastUsedAt,
        session.dayUid,
      ],
    });
  }
  for (const exercise of snapshot.sessionExercises) {
    stmts.push({
      sql: `INSERT INTO session_exercises (uid, session_id, source_exercise_id, name, sets, reps, sort)
            SELECT ?, s.id, COALESCE((SELECT id FROM exercises WHERE uid = ?), 0), ?, ?, ?, ?
            FROM sessions s WHERE s.uid = ?`,
      params: [
        exercise.uid,
        exercise.sourceExerciseUid,
        exercise.name,
        exercise.sets,
        exercise.reps,
        exercise.sort,
        exercise.sessionUid,
      ],
    });
  }
  for (const set of snapshot.sessionSets) {
    stmts.push({
      sql: `INSERT INTO session_sets (uid, session_exercise_id, set_index, completed, weight_kg, actual_reps)
            SELECT ?, id, ?, ?, ?, ? FROM session_exercises WHERE uid = ?`,
      params: [
        set.uid,
        set.setIndex,
        set.completed ? 1 : 0,
        set.weightKg,
        set.actualReps,
        set.sessionExerciseUid,
      ],
    });
  }
  for (const setting of snapshot.settings ?? []) {
    if (!isSyncSettingKey(setting.key)) continue;
    stmts.push({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?)',
      params: [setting.key, setting.value],
    });
  }

  try {
    if (stmts.length > 0) await driver.batch(stmts);
  } catch (error) {
    if (isUniqueConstraint(error)) throw new DomainError('Ya hay otra sesión abierta para este día.', 409);
    throw error;
  }
}
