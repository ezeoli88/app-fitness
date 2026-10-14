import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/db/settings';
import { writeTransaction } from '@/db/writes';
import { pickActiveRoutine, validateRoutineDraft, type Routine } from '@/domain/routine';
import type {
  CompletedSession,
  Day,
  Exercise,
  RoutineDraft,
  Session,
  SessionDetails,
  SessionExercise,
  SessionSet,
  SessionStatus,
} from '@/domain/types';

type SessionRow = {
  id: number;
  day_id: number;
  started_at: string;
  completed_at: string | null;
  completed_sets: string;
  status: SessionStatus;
  routine_id: string;
  routine_title: string;
  day_title: string;
};

type SessionExerciseRow = SessionExercise & { archived_at?: string | null };

export function serializeSets(sets: Record<number, boolean[]>): string {
  return JSON.stringify(sets);
}

export function parseSets(raw: string): Record<number, boolean[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<number, boolean[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (Number.isSafeInteger(id) && Array.isArray(value)) out[id] = value.map(Boolean);
    }
    return out;
  } catch {
    return {};
  }
}

function makeId(): string {
  return `rutina-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function asCompleted(row: SessionRow, marks: Record<number, boolean[]>): CompletedSession {
  return {
    ...mapSession(row, marks),
    exercisesCompleted: Object.values(marks).filter((sets) => sets.length > 0 && sets.every(Boolean)).length,
    exercisesTotal: Object.keys(marks).length,
  };
}

function mapSession(
  row: SessionRow,
  marks = parseSets(row.completed_sets)
): Session {
  return {
    id: row.id,
    dayId: row.day_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completedSets: marks,
    status: row.status,
    routineId: row.routine_id,
    routineTitle: row.routine_title,
    dayTitle: row.day_title,
  };
}

export type GymDb = {
  listRoutines(includeArchived?: boolean): Promise<Routine[]>;
  getActiveRoutine(): Promise<Routine | null>;
  setActiveRoutine(id: string): Promise<void>;
  getRoutineDraft(id: string): Promise<RoutineDraft | null>;
  saveRoutine(draft: RoutineDraft): Promise<string>;
  duplicateRoutine(id: string): Promise<string | null>;
  archiveRoutine(id: string): Promise<void>;
  listDays(routineId?: string): Promise<Day[]>;
  listExercises(dayId: number): Promise<Exercise[]>;
  getOpenSession(dayId: number): Promise<Session | null>;
  listOpenSessions(): Promise<Session[]>;
  getSessionDetails(sessionId: number): Promise<SessionDetails | null>;
  getOrCreateOpenSession(dayId: number): Promise<SessionDetails>;
  updateSessionSet(
    sessionId: number,
    exerciseId: number,
    setIndex: number,
    patch: Partial<Pick<SessionSet, 'completed' | 'weightKg' | 'actualReps'>>
  ): Promise<void>;
  finishSession(sessionId: number, completedAtIso: string): Promise<SessionStatus>;
  reopenSession(sessionId: number): Promise<void>;
  discardEmptySession(sessionId: number): Promise<void>;
  previousExerciseSets(routineId: string, exerciseId: number): Promise<SessionSet[]>;
  updateHistoricalSet(setId: number, patch: Partial<Pick<SessionSet, 'weightKg' | 'actualReps'>>): Promise<void>;
  lastCompleted(routineId?: string): Promise<CompletedSession | null>;
  listCompleted(limit: number, offset?: number, routineId?: string | null): Promise<CompletedSession[]>;
  listRoutineHistory(): Promise<Routine[]>;
};

const SESSION_COLUMNS = `
  id, day_id, started_at, completed_at, completed_sets,
  status, routine_id, routine_title, day_title
`;

export function createGymDb(db: SQLiteDatabase): GymDb {
  async function listRoutines(includeArchived = false): Promise<Routine[]> {
    const archivedFilter = includeArchived ? '' : 'WHERE archived_at IS NULL';
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      level: string;
      sort: number;
      archivedAt: string | null;
    }>(
      `SELECT id, title, level, sort, archived_at AS archivedAt
       FROM routines ${archivedFilter} ORDER BY sort ASC, title COLLATE NOCASE ASC`
    );
    return rows.map((row) => ({ ...row, archivedAt: row.archivedAt ?? null }));
  }

  async function getActiveRoutine(): Promise<Routine | null> {
    const routines = await listRoutines(true);
    const stored = await getSetting(db, 'activeRoutineId');
    return pickActiveRoutine(routines, stored);
  }

  async function activeRoutineId(): Promise<string | null> {
    return (await getActiveRoutine())?.id ?? null;
  }

  async function sessionMarks(sessionId: number): Promise<Record<number, boolean[]>> {
    const rows = await db.getAllAsync<{
      sourceExerciseId: number;
      setIndex: number;
      completed: number;
    }>(
      `SELECT se.source_exercise_id AS sourceExerciseId,
              ss.set_index AS setIndex, ss.completed
       FROM session_exercises se
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE se.session_id = ? ORDER BY se.sort, ss.set_index`,
      sessionId
    );
    const marks: Record<number, boolean[]> = {};
    for (const row of rows) {
      const exerciseMarks = marks[row.sourceExerciseId] ?? [];
      exerciseMarks[row.setIndex] = Boolean(row.completed);
      marks[row.sourceExerciseId] = exerciseMarks;
    }
    for (const exerciseMarks of Object.values(marks)) {
      for (let i = 0; i < exerciseMarks.length; i++) exerciseMarks[i] ??= false;
    }
    return marks;
  }

  async function getSessionDetails(sessionId: number): Promise<SessionDetails | null> {
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`,
      sessionId
    );
    if (!row) return null;

    const exercises = await db.getAllAsync<SessionExerciseRow>(
      `SELECT id, session_id AS sessionId, source_exercise_id AS sourceExerciseId,
              name, sets, reps, sort
       FROM session_exercises WHERE session_id = ? ORDER BY sort ASC, id ASC`,
      sessionId
    );
    const details: SessionDetails['exercises'] = [];
    for (const exercise of exercises) {
      const series = await db.getAllAsync<{
        id: number;
        sessionExerciseId: number;
        setIndex: number;
        completed: number;
        weightKg: number | null;
        actualReps: number | null;
      }>(
        `SELECT id, session_exercise_id AS sessionExerciseId, set_index AS setIndex,
                completed, weight_kg AS weightKg, actual_reps AS actualReps
         FROM session_sets WHERE session_exercise_id = ? ORDER BY set_index ASC`,
        exercise.id
      );
      details.push({
        ...exercise,
        series: series.map((set) => ({ ...set, completed: Boolean(set.completed) })),
      });
    }
    return { ...mapSession(row, await sessionMarks(sessionId)), exercises: details };
  }

  return {
    listRoutines,
    getActiveRoutine,
    async setActiveRoutine(id) {
      const exists = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM routines WHERE id = ? AND archived_at IS NULL',
        id
      );
      if (!exists) throw new Error('Esa rutina ya no está disponible.');
      await setSetting(db, 'activeRoutineId', id);
    },

    async getRoutineDraft(id) {
      const routine = await db.getFirstAsync<Routine>(
        `SELECT id, title, level, sort FROM routines WHERE id = ? AND archived_at IS NULL`,
        id
      );
      if (!routine) return null;
      const days = await db.getAllAsync<{ id: number; title: string; sort: number }>(
        `SELECT id, title, sort FROM days
         WHERE routine_id = ? AND archived_at IS NULL ORDER BY sort, id`,
        id
      );
      const draftDays: RoutineDraft['days'] = [];
      for (const day of days) {
        const exercises = await db.getAllAsync<{
          id: number;
          name: string;
          sets: number;
          reps: number;
          sort: number;
        }>(
          `SELECT id, name, sets, reps, sort FROM exercises
           WHERE day_id = ? AND archived_at IS NULL ORDER BY sort, id`,
          day.id
        );
        draftDays.push({ ...day, exercises });
      }
      return { ...routine, days: draftDays };
    },

    async saveRoutine(draft) {
      const validation = validateRoutineDraft(draft);
      if (validation) throw new Error(validation);
      const routineId = draft.id ?? makeId();
      const now = new Date().toISOString();
      await writeTransaction(db, async (tx) => {
        const existing = await tx.getFirstAsync<{ id: string }>(
          'SELECT id FROM routines WHERE id = ? AND archived_at IS NULL',
          routineId
        );
        if (draft.id && !existing) throw new Error('No encontramos esa rutina. Actualizá la lista.');

        if (existing) {
          await tx.runAsync(
            'UPDATE routines SET title = ?, level = ?, sort = ? WHERE id = ?',
            draft.title.trim(),
            draft.level.trim() || 'personalizada',
            draft.sort,
            routineId
          );
          await tx.runAsync('UPDATE exercises SET archived_at = ? WHERE day_id IN (SELECT id FROM days WHERE routine_id = ?) AND archived_at IS NULL', now, routineId);
          await tx.runAsync(
            'UPDATE days SET archived_at = ? WHERE routine_id = ? AND archived_at IS NULL',
            now,
            routineId
          );
        } else {
          await tx.runAsync(
            'INSERT INTO routines (id, title, level, sort, archived_at) VALUES (?, ?, ?, ?, NULL)',
            routineId,
            draft.title.trim(),
            draft.level.trim() || 'personalizada',
            draft.sort
          );
        }

        for (const [dayIndex, day] of draft.days.entries()) {
          let dayId: number;
          if (day.id !== null) {
            const belongs = await tx.getFirstAsync<{ id: number }>(
              'SELECT id FROM days WHERE id = ? AND routine_id = ?',
              day.id,
              routineId
            );
            if (!belongs) throw new Error(`El día «${day.title}» ya no pertenece a esta rutina.`);
            await tx.runAsync(
              'UPDATE days SET title = ?, sort = ?, archived_at = NULL WHERE id = ?',
              day.title.trim(),
              dayIndex,
              day.id
            );
            dayId = day.id;
            await tx.runAsync(
              'UPDATE exercises SET archived_at = ? WHERE day_id = ? AND archived_at IS NULL',
              now,
              dayId
            );
          } else {
            const result = await tx.runAsync(
              `INSERT INTO days (routine_id, title, sort, archived_at)
               VALUES (?, ?, ?, NULL)`,
              routineId,
              day.title.trim(),
              dayIndex
            );
            dayId = result.lastInsertRowId;
          }

          for (const [exerciseIndex, exercise] of day.exercises.entries()) {
            if (exercise.id !== null) {
              const belongs = await tx.getFirstAsync<{ id: number }>(
                'SELECT id FROM exercises WHERE id = ? AND day_id = ?',
                exercise.id,
                dayId
              );
              if (!belongs) {
                throw new Error(`El ejercicio «${exercise.name}» ya no pertenece a este día.`);
              }
              await tx.runAsync(
                `UPDATE exercises SET name = ?, sets = ?, reps = ?, sort = ?, archived_at = NULL
                 WHERE id = ?`,
                exercise.name.trim(),
                exercise.sets,
                exercise.reps,
                exerciseIndex,
                exercise.id
              );
            } else {
              await tx.runAsync(
                `INSERT INTO exercises (day_id, name, sets, reps, sort, archived_at)
                 VALUES (?, ?, ?, ?, ?, NULL)`,
                dayId,
                exercise.name.trim(),
                exercise.sets,
                exercise.reps,
                exerciseIndex
              );
            }
          }
        }
      });
      return routineId;
    },

    async duplicateRoutine(id) {
      const source = await this.getRoutineDraft(id);
      if (!source) return null;
      const { id: _sourceId, ...copy } = source;
      return this.saveRoutine({
        ...copy,
        id: null,
        title: `${source.title} (copia)`,
        days: source.days.map((day) => ({
          ...day,
          id: null,
          exercises: day.exercises.map((exercise) => ({ ...exercise, id: null })),
        })),
      });
    },

    async archiveRoutine(id) {
      const now = new Date().toISOString();
      await writeTransaction(db, async (tx) => {
        const current = await tx.getFirstAsync<{ id: string }>(
          'SELECT id FROM routines WHERE id = ? AND archived_at IS NULL',
          id
        );
        if (!current) return;
        const available = await tx.getAllAsync<{ id: string }>(
          'SELECT id FROM routines WHERE archived_at IS NULL ORDER BY sort, title COLLATE NOCASE'
        );

        await tx.runAsync('UPDATE routines SET archived_at = ? WHERE id = ?', now, id);
        await tx.runAsync(
          'UPDATE days SET archived_at = ? WHERE routine_id = ? AND archived_at IS NULL',
          now,
          id
        );
        await tx.runAsync(
          `UPDATE exercises SET archived_at = ?
           WHERE day_id IN (SELECT id FROM days WHERE routine_id = ?) AND archived_at IS NULL`,
          now,
          id
        );
        const activeId = await getSetting(tx, 'activeRoutineId');
        if (activeId === id) {
          const nextActiveId = available.find((routine) => routine.id !== id)?.id ?? null;
          await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'activeRoutineId', nextActiveId ?? '');
        }
      });
    },

    async listDays(routineId) {
      const selectedRoutineId = routineId ?? (await activeRoutineId());
      if (!selectedRoutineId) return [];
      return db.getAllAsync<Day>(
        `SELECT id, routine_id AS routineId, title, sort FROM days
         WHERE routine_id = ? AND archived_at IS NULL ORDER BY sort, id`,
        selectedRoutineId
      );
    },

    async listExercises(dayId) {
      return db.getAllAsync<Exercise>(
        `SELECT id, day_id AS dayId, name, sets, reps, sort FROM exercises
         WHERE day_id = ? AND archived_at IS NULL ORDER BY sort, id`,
        dayId
      );
    },

    async getOpenSession(dayId) {
      const row = await db.getFirstAsync<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE day_id = ? AND status = 'open' ORDER BY started_at DESC, id DESC LIMIT 1`,
        dayId
      );
      return row ? mapSession(row, await sessionMarks(row.id)) : null;
    },

    async listOpenSessions() {
      const routineId = await activeRoutineId();
      if (!routineId) return [];
      const rows = await db.getAllAsync<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE routine_id = ? AND status = 'open' ORDER BY COALESCE((SELECT value FROM settings WHERE key = 'sessionLastUsed:' || sessions.id), started_at) DESC, id DESC`,
        routineId
      );
      const sessions: Session[] = [];
      for (const row of rows) sessions.push(mapSession(row, await sessionMarks(row.id)));
      return sessions;
    },

    getSessionDetails,

    async getOrCreateOpenSession(dayId) {
      let createdId = 0;
      await writeTransaction(db, async (tx) => {
        const row = await tx.getFirstAsync<{ id: number }>(
          `SELECT id FROM sessions
           WHERE day_id = ? AND status = 'open' ORDER BY started_at DESC, id DESC LIMIT 1`,
          dayId
        );
        if (row) {
          createdId = row.id;
          await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', `sessionLastUsed:${row.id}`, new Date().toISOString());
          return;
        }

        const day = await tx.getFirstAsync<{
          id: number;
          title: string;
          sort: number;
          routineId: string;
          routineTitle: string;
        }>(
          `SELECT d.id, d.title, d.sort, d.routine_id AS routineId,
                  r.title AS routineTitle
           FROM days d JOIN routines r ON r.id = d.routine_id
           WHERE d.id = ? AND d.archived_at IS NULL AND r.archived_at IS NULL`,
          dayId
        );
        if (!day) throw new Error('No encontramos ese día en tu rutina.');

        const result = await tx.runAsync(
          `INSERT INTO sessions
             (day_id, started_at, completed_at, completed_sets, status, routine_id, routine_title, day_title)
           VALUES (?, ?, NULL, '{}', 'open', ?, ?, ?)`,
          dayId,
          new Date().toISOString(),
          day.routineId,
          day.routineTitle,
          day.title
        );
        createdId = result.lastInsertRowId;

        const exercises = await tx.getAllAsync<Exercise>(
          `SELECT id, day_id AS dayId, name, sets, reps, sort FROM exercises
           WHERE day_id = ? AND archived_at IS NULL ORDER BY sort, id`,
          dayId
        );
        for (const exercise of exercises) {
          const snapshot = await tx.runAsync(
            `INSERT INTO session_exercises
               (session_id, source_exercise_id, name, sets, reps, sort)
             VALUES (?, ?, ?, ?, ?, ?)`,
            createdId,
            exercise.id,
            exercise.name,
            exercise.sets,
            exercise.reps,
            exercise.sort
          );
          for (let index = 0; index < exercise.sets; index++) {
            await tx.runAsync(
              `INSERT INTO session_sets (session_exercise_id, set_index, completed)
               VALUES (?, ?, 0)`,
              snapshot.lastInsertRowId,
              index
            );
          }
        }
      });
      const details = await getSessionDetails(createdId);
      if (!details) throw new Error('No se pudo abrir la sesión.');
      return details;
    },

    async updateSessionSet(sessionId, exerciseId, setIndex, patch) {
      await writeTransaction(db, async (tx) => {
        const exercise = await tx.getFirstAsync<{ id: number; sets: number }>(
          `SELECT id, sets FROM session_exercises
           WHERE session_id = ? AND source_exercise_id = ?`,
          sessionId,
          exerciseId
        );
        if (!exercise || !Number.isSafeInteger(setIndex) || setIndex < 0 || setIndex >= exercise.sets) {
          throw new Error('Esa serie ya no está disponible.');
        }
        const session = await tx.getFirstAsync<{ status: string }>(
          'SELECT status FROM sessions WHERE id = ?',
          sessionId
        );
        if (session?.status !== 'open') throw new Error('La sesión ya está cerrada.');
        const current = await tx.getFirstAsync<{
          completed: number;
          weight_kg: number | null;
          actual_reps: number | null;
        }>(
          `SELECT completed, weight_kg, actual_reps FROM session_sets
           WHERE session_exercise_id = ? AND set_index = ?`,
          exercise.id,
          setIndex
        );
        if (!current) throw new Error('No encontramos los datos de esa serie.');
        const completed = patch.completed ?? Boolean(current.completed);
        const weightKg = patch.weightKg === undefined ? current.weight_kg : patch.weightKg;
        const actualReps = patch.actualReps === undefined ? current.actual_reps : patch.actualReps;
        if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0)) {
          throw new Error('El peso debe ser un número igual o mayor a cero.');
        }
        if (actualReps !== null && (!Number.isSafeInteger(actualReps) || actualReps < 1)) {
          throw new Error('Las repeticiones deben ser un entero positivo.');
        }
        await tx.runAsync(
          `UPDATE session_sets SET completed = ?, weight_kg = ?, actual_reps = ?
           WHERE session_exercise_id = ? AND set_index = ?`,
          completed ? 1 : 0,
          weightKg,
          actualReps,
          exercise.id,
          setIndex
        );
        await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', `sessionLastUsed:${sessionId}`, new Date().toISOString());
        if (patch.completed === undefined) return;
        const marksRows = await tx.getAllAsync<{
          sourceExerciseId: number;
          setIndex: number;
          completed: number;
        }>(
          `SELECT se.source_exercise_id AS sourceExerciseId,
                  ss.set_index AS setIndex, ss.completed
           FROM session_exercises se JOIN session_sets ss ON ss.session_exercise_id = se.id
           WHERE se.session_id = ? ORDER BY se.sort, ss.set_index`,
          sessionId
        );
        const marks: Record<number, boolean[]> = {};
        for (const row of marksRows) {
          (marks[row.sourceExerciseId] ??= [])[row.setIndex] = Boolean(row.completed);
        }
        await tx.runAsync(
          'UPDATE sessions SET completed_sets = ? WHERE id = ?',
          serializeSets(marks),
          sessionId
        );
      });
    },

    async finishSession(sessionId, completedAtIso) {
      let status: SessionStatus = 'open';
      await writeTransaction(db, async (tx) => {
        const row = await tx.getFirstAsync<{ completed: number; total: number }>(
          `SELECT COUNT(*) AS total, COALESCE(SUM(ss.completed), 0) AS completed
           FROM session_exercises se JOIN session_sets ss ON ss.session_exercise_id = se.id
           WHERE se.session_id = ?`,
          sessionId
        );
        if (!row || row.completed === 0) throw new Error('Marcá al menos una serie antes de finalizar.');
        status = row.completed === row.total ? 'completed' : 'partial';
        const updated = await tx.runAsync(
          `UPDATE sessions SET status = ?, completed_at = ? WHERE id = ? AND status = 'open'`,
          status,
          completedAtIso,
          sessionId
        );
        if (updated.changes === 0) throw new Error('La sesión ya estaba finalizada.');
      });
      return status;
    },

    async reopenSession(sessionId) {
      await writeTransaction(db, async (tx) => {
        const other = await tx.getFirstAsync<{ id: number }>(
          "SELECT id FROM sessions WHERE day_id = (SELECT day_id FROM sessions WHERE id = ?) AND status = 'open' AND id != ?",
          sessionId, sessionId
        );
        if (other) throw new Error('Ya hay otra sesión abierta para este día.');
        const result = await tx.runAsync(
          "UPDATE sessions SET status = 'open', completed_at = NULL WHERE id = ? AND status IN ('completed', 'partial')",
          sessionId
        );
        if (result.changes === 0) throw new Error('No se pudo reabrir la sesión.');
      });
    },

    async discardEmptySession(sessionId) {
      await writeTransaction(db, async (tx) => {
        const session = await tx.getFirstAsync<{ status: string }>(
          'SELECT status FROM sessions WHERE id = ?',
          sessionId
        );
        if (session?.status !== 'open') throw new Error('Solo se puede descartar una sesión vacía.');
        const marked = await tx.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM session_exercises se
           JOIN session_sets ss ON ss.session_exercise_id = se.id
           WHERE se.session_id = ? AND ss.completed = 1`,
          sessionId
        );
        if ((marked?.count ?? 0) > 0) throw new Error('Solo se puede descartar una sesión vacía.');
        await tx.runAsync(
          'DELETE FROM session_sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)',
          sessionId
        );
        await tx.runAsync('DELETE FROM session_exercises WHERE session_id = ?', sessionId);
        await tx.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
      });
    },

    async previousExerciseSets(routineId, exerciseId) {
      const prior = await db.getFirstAsync<{ id: number }>(
        `SELECT s.id FROM sessions s
         WHERE s.routine_id = ? AND s.status IN ('completed', 'partial')
           AND EXISTS (
             SELECT 1 FROM session_exercises se JOIN session_sets ss ON ss.session_exercise_id = se.id
             WHERE se.session_id = s.id AND se.source_exercise_id = ? AND ss.completed = 1
           )
         ORDER BY s.completed_at DESC, s.id DESC LIMIT 1`,
        routineId,
        exerciseId
      );
      if (!prior) return [];
      const rows = await db.getAllAsync<{
        id: number;
        sessionExerciseId: number;
        setIndex: number;
        completed: number;
        weightKg: number | null;
        actualReps: number | null;
      }>(
        `SELECT ss.id, ss.session_exercise_id AS sessionExerciseId,
                ss.set_index AS setIndex, ss.completed,
                ss.weight_kg AS weightKg, ss.actual_reps AS actualReps
         FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? AND se.source_exercise_id = ? ORDER BY ss.set_index`,
        prior.id,
        exerciseId
      );
      return rows.map((row) => ({ ...row, completed: Boolean(row.completed) }));
    },

    async updateHistoricalSet(setId, patch) {
      if (patch.weightKg !== undefined && patch.weightKg !== null && (!Number.isFinite(patch.weightKg) || patch.weightKg < 0)) {
        throw new Error('El peso debe ser un número igual o mayor a cero.');
      }
      if (patch.actualReps !== undefined && patch.actualReps !== null && (!Number.isSafeInteger(patch.actualReps) || patch.actualReps < 1)) {
        throw new Error('Las repeticiones deben ser un entero positivo.');
      }
      await writeTransaction(db, async (tx) => {
      const current = await tx.getFirstAsync<{
        weightKg: number | null;
        actualReps: number | null;
        completed: number;
      }>(`SELECT weight_kg AS weightKg, actual_reps AS actualReps, completed FROM session_sets WHERE id = ? AND session_exercise_id IN (SELECT se.id FROM session_exercises se JOIN sessions s ON s.id = se.session_id WHERE s.status IN ('completed', 'partial'))`, setId);
      if (!current || !current.completed) throw new Error('Solo podés corregir una serie realizada.');
      await tx.runAsync(
        'UPDATE session_sets SET weight_kg = ?, actual_reps = ? WHERE id = ?',
        patch.weightKg === undefined ? current.weightKg : patch.weightKg,
        patch.actualReps === undefined ? current.actualReps : patch.actualReps,
        setId
      );
      });
    },

    async lastCompleted(routineId) {
      const selectedRoutine = routineId ?? (await activeRoutineId());
      if (!selectedRoutine) return null;
      const row = await db.getFirstAsync<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE routine_id = ? AND status IN ('completed', 'partial')
         ORDER BY completed_at DESC, id DESC LIMIT 1`,
        selectedRoutine
      );
      return row ? asCompleted(row, await sessionMarks(row.id)) : null;
    },

    async listCompleted(limit, offset = 0, routineId) {
      const selectedRoutine = routineId === undefined ? await activeRoutineId() : routineId;
      const condition = selectedRoutine === null ? '' : 'AND routine_id = ?';
      const query = `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE status IN ('completed', 'partial') ${condition}
         ORDER BY completed_at DESC, id DESC LIMIT ? OFFSET ?`;
      const rows = selectedRoutine === null
        ? await db.getAllAsync<SessionRow>(query, limit, offset)
        : await db.getAllAsync<SessionRow>(query, selectedRoutine, limit, offset);
      const sessions: CompletedSession[] = [];
      for (const row of rows) sessions.push(asCompleted(row, await sessionMarks(row.id)));
      return sessions;
    },

    async listRoutineHistory() {
      return listRoutines(true);
    },
  };
}
