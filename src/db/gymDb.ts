import type { BatchResult, SqlDriver, SqlValue, Stmt } from '@/db/core/driver';
import { createUid, isUniqueConstraint } from '@/db/core/driver';
import { DomainError } from '@/domain/errors';
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

type MarkRow = {
  sessionId: number;
  sourceExerciseId: number;
  setIndex: number;
  completed: number;
};

type Planned = {
  stmt: Stmt;
  error?: string;
  status?: 409 | 422;
  stillApplied?: () => Promise<boolean>;
};

export type HomeDay = { day: Day; exercises: Exercise[]; open: Session | null };

export type HomeSnapshot = {
  routine: Routine | null;
  days: HomeDay[];
  openSessions: Session[];
  lastCompleted: CompletedSession | null;
  recent: CompletedSession[];
};

export type SetState = { completed: boolean; status: SessionStatus };

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

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

const CHOSEN_ROUTINE_ID = `(
  SELECT id FROM (
    SELECT r.id AS id, 0 AS priority, r.sort AS sort, r.title AS title
    FROM routines r
    JOIN settings s ON s.key = 'activeRoutineId' AND s.value = r.id
    WHERE r.archived_at IS NULL
    UNION ALL
    SELECT r.id, 1, r.sort, r.title FROM routines r
    WHERE r.id = 'principiantes' AND r.archived_at IS NULL
    UNION ALL
    SELECT r.id, 2, r.sort, r.title FROM routines r
    WHERE r.archived_at IS NULL
  )
  ORDER BY priority, sort, title COLLATE NOCASE
  LIMIT 1
)`;

const SESSION_COLUMNS = `
  id, day_id, started_at, completed_at, completed_sets,
  status, routine_id, routine_title, day_title
`;

function groupMarks(rows: MarkRow[]): Map<number, Record<number, boolean[]>> {
  const bySession = new Map<number, Record<number, boolean[]>>();
  for (const row of rows) {
    const marks = bySession.get(row.sessionId) ?? {};
    const exerciseMarks = marks[row.sourceExerciseId] ?? [];
    exerciseMarks[row.setIndex] = Boolean(row.completed);
    marks[row.sourceExerciseId] = exerciseMarks;
    bySession.set(row.sessionId, marks);
  }
  for (const marks of bySession.values()) {
    for (const exerciseMarks of Object.values(marks)) {
      for (let index = 0; index < exerciseMarks.length; index++) exerciseMarks[index] ??= false;
    }
  }
  return bySession;
}

function mapSession(row: SessionRow, marks: Record<number, boolean[]>): Session {
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

function asCompleted(row: SessionRow, marks: Record<number, boolean[]>): CompletedSession {
  return {
    ...mapSession(row, marks),
    exercisesCompleted: Object.values(marks).filter((sets) => sets.length > 0 && sets.every(Boolean)).length,
    exercisesTotal: Object.keys(marks).length,
  };
}

function assertWeight(weightKg: number | null): void {
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0)) {
    throw new DomainError('El peso debe ser un número igual o mayor a cero.', 422);
  }
}

function assertReps(actualReps: number | null): void {
  if (actualReps !== null && (!Number.isSafeInteger(actualReps) || actualReps < 1)) {
    throw new DomainError('Las repeticiones deben ser un entero positivo.', 422);
  }
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
  getHomeSnapshot(): Promise<HomeSnapshot>;
  getSetState(sessionId: number, exerciseId: number, setIndex: number): Promise<SetState | null>;
};

export function createGymDb(driver: SqlDriver): GymDb {
  async function listRoutines(includeArchived = false): Promise<Routine[]> {
    const archivedFilter = includeArchived ? '' : 'WHERE archived_at IS NULL';
    const rows = await driver.all<{
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
    const stored = await driver.first<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'activeRoutineId'"
    );
    return pickActiveRoutine(routines, stored?.value ?? null);
  }

  async function activeRoutineId(): Promise<string | null> {
    return (await getActiveRoutine())?.id ?? null;
  }

  async function marksFor(sessionIds: number[]): Promise<Map<number, Record<number, boolean[]>>> {
    if (sessionIds.length === 0) return new Map();
    const rows = await driver.all<MarkRow>(
      `SELECT se.session_id AS sessionId, se.source_exercise_id AS sourceExerciseId,
              ss.set_index AS setIndex, ss.completed
       FROM session_exercises se
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE se.session_id IN (${placeholders(sessionIds.length)})
       ORDER BY se.sort, ss.set_index`,
      ...sessionIds
    );
    return groupMarks(rows);
  }

  async function getSessionDetails(sessionId: number): Promise<SessionDetails | null> {
    const row = await driver.first<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`,
      sessionId
    );
    if (!row) return null;
    const exercises = await driver.all<SessionExercise>(
      `SELECT id, session_id AS sessionId, source_exercise_id AS sourceExerciseId,
              name, sets, reps, sort
       FROM session_exercises WHERE session_id = ? ORDER BY sort ASC, id ASC`,
      sessionId
    );
    const series = exercises.length === 0
      ? []
      : await driver.all<{
        id: number;
        sessionExerciseId: number;
        sourceExerciseId: number;
        setIndex: number;
        completed: number;
        weightKg: number | null;
        actualReps: number | null;
      }>(
        `SELECT ss.id, ss.session_exercise_id AS sessionExerciseId,
                se.source_exercise_id AS sourceExerciseId,
                ss.set_index AS setIndex, ss.completed,
                ss.weight_kg AS weightKg, ss.actual_reps AS actualReps
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ?
         ORDER BY se.sort, ss.set_index`,
        sessionId
      );
    const byExercise = new Map<number, SessionSet[]>();
    for (const set of series) {
      const list = byExercise.get(set.sessionExerciseId) ?? [];
      list.push({
        id: set.id,
        sessionExerciseId: set.sessionExerciseId,
        setIndex: set.setIndex,
        completed: Boolean(set.completed),
        weightKg: set.weightKg,
        actualReps: set.actualReps,
      });
      byExercise.set(set.sessionExerciseId, list);
    }
    const marks = groupMarks(series.map((set) => ({
      sessionId,
      sourceExerciseId: set.sourceExerciseId,
      setIndex: set.setIndex,
      completed: set.completed,
    }))).get(sessionId) ?? {};
    return {
      ...mapSession(row, marks),
      exercises: exercises.map((exercise) => ({
        ...exercise,
        series: byExercise.get(exercise.id) ?? [],
      })),
    };
  }

  async function applyPlanned(planned: Planned[]): Promise<BatchResult[]> {
    if (planned.length === 0) return [];
    const results = await driver.batch(planned.map((item) => item.stmt));
    for (let index = 0; index < planned.length; index++) {
      const item = planned[index];
      if (!item.error || results[index].changes > 0) continue;
      if (item.stillApplied && await item.stillApplied()) continue;
      throw new DomainError(item.error, item.status ?? 409);
    }
    return results;
  }

  async function sessionsWithMarks(rows: SessionRow[]): Promise<Session[]> {
    const marks = await marksFor(rows.map((row) => row.id));
    return rows.map((row) => mapSession(row, marks.get(row.id) ?? {}));
  }

  return {
    listRoutines,
    getActiveRoutine,

    async setActiveRoutine(id) {
      await driver.exclusive(async () => {
        const result = await driver.run(
          `INSERT OR REPLACE INTO settings (key, value)
           SELECT 'activeRoutineId', ?
           WHERE EXISTS (SELECT 1 FROM routines WHERE id = ? AND archived_at IS NULL)`,
          id,
          id
        );
        if (result.changes === 0) throw new DomainError('Esa rutina ya no está disponible.');
      });
    },

    async getRoutineDraft(id) {
      const routine = await driver.first<Routine>(
        'SELECT id, title, level, sort FROM routines WHERE id = ? AND archived_at IS NULL',
        id
      );
      if (!routine) return null;
      const days = await driver.all<{ id: number; title: string; sort: number }>(
        `SELECT id, title, sort FROM days
         WHERE routine_id = ? AND archived_at IS NULL ORDER BY sort, id`,
        id
      );
      const draftDays: RoutineDraft['days'] = days.map((day) => ({ ...day, exercises: [] }));
      if (days.length > 0) {
        const exercises = await driver.all<{
          id: number;
          dayId: number;
          name: string;
          sets: number;
          reps: number;
          sort: number;
        }>(
          `SELECT id, day_id AS dayId, name, sets, reps, sort FROM exercises
           WHERE archived_at IS NULL AND day_id IN (${placeholders(days.length)})
           ORDER BY sort, id`,
          ...days.map((day) => day.id)
        );
        const byDay = new Map<number, RoutineDraft['days'][number]['exercises']>();
        for (const exercise of exercises) {
          const list = byDay.get(exercise.dayId) ?? [];
          list.push({
            id: exercise.id,
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            sort: exercise.sort,
          });
          byDay.set(exercise.dayId, list);
        }
        for (const day of draftDays) day.exercises = byDay.get(day.id!) ?? [];
      }
      return { ...routine, days: draftDays };
    },

    async saveRoutine(draft) {
      const validation = validateRoutineDraft(draft);
      if (validation) throw new DomainError(validation, 422);
      const routineId = draft.id ?? makeId();
      const now = new Date().toISOString();
      const title = draft.title.trim();
      const level = draft.level.trim() || 'personalizada';

      if (draft.id) {
        const existing = await driver.first<{ id: string }>(
          'SELECT id FROM routines WHERE id = ? AND archived_at IS NULL',
          routineId
        );
        if (!existing) throw new DomainError('No encontramos esa rutina. Actualizá la lista.');
        for (const day of draft.days) {
          if (day.id === null) {
            for (const exercise of day.exercises) {
              if (exercise.id !== null) {
                throw new DomainError(`El ejercicio «${exercise.name}» ya no pertenece a este día.`);
              }
            }
            continue;
          }
          const belongs = await driver.first<{ id: number }>(
            'SELECT id FROM days WHERE id = ? AND routine_id = ?',
            day.id,
            routineId
          );
          if (!belongs) throw new DomainError(`El día «${day.title}» ya no pertenece a esta rutina.`);
          for (const exercise of day.exercises) {
            if (exercise.id === null) continue;
            const exerciseBelongs = await driver.first<{ id: number }>(
              'SELECT id FROM exercises WHERE id = ? AND day_id = ?',
              exercise.id,
              day.id
            );
            if (!exerciseBelongs) {
              throw new DomainError(`El ejercicio «${exercise.name}» ya no pertenece a este día.`);
            }
          }
        }
      }

      const routineActive = 'EXISTS (SELECT 1 FROM routines WHERE id = ? AND archived_at IS NULL)';
      const planned: Planned[] = [];
      if (draft.id) {
        planned.push({
          stmt: {
            sql: `UPDATE routines SET title = ?, level = ?, sort = ? WHERE id = ? AND archived_at IS NULL`,
            params: [title, level, draft.sort, routineId],
          },
          error: 'No encontramos esa rutina. Actualizá la lista.',
          stillApplied: async () => Boolean(await driver.first(
            'SELECT id FROM routines WHERE id = ? AND archived_at IS NULL AND title = ? AND level = ? AND sort = ?',
            routineId,
            title,
            level,
            draft.sort
          )),
        });
        const keptDayIds = draft.days.flatMap((day) => (day.id === null ? [] : [day.id]));
        const keptExerciseIds = draft.days.flatMap((day) =>
          day.exercises.flatMap((exercise) => (exercise.id === null ? [] : [exercise.id]))
        );
        const exerciseNotIn = keptExerciseIds.length > 0 ? `AND id NOT IN (${placeholders(keptExerciseIds.length)})` : '';
        planned.push({
          stmt: {
            sql: `UPDATE exercises SET archived_at = ?
                  WHERE archived_at IS NULL
                    AND day_id IN (SELECT id FROM days WHERE routine_id = ?)
                    ${exerciseNotIn}
                    AND ${routineActive}`,
            params: [now, routineId, ...keptExerciseIds, routineId],
          },
        });
        const dayNotIn = keptDayIds.length > 0 ? `AND id NOT IN (${placeholders(keptDayIds.length)})` : '';
        planned.push({
          stmt: {
            sql: `UPDATE days SET archived_at = ?
                  WHERE routine_id = ? AND archived_at IS NULL
                    ${dayNotIn}
                    AND ${routineActive}`,
            params: [now, routineId, ...keptDayIds, routineId],
          },
        });
        for (const [dayIndex, day] of draft.days.entries()) {
          if (day.id === null) continue;
          const dayTitle = day.title.trim();
          const dayId = day.id;
          planned.push({
            stmt: {
              sql: `UPDATE days SET title = ?, sort = ?, archived_at = NULL
                    WHERE id = ? AND routine_id = ? AND ${routineActive}`,
              params: [dayTitle, dayIndex, dayId, routineId, routineId],
            },
            error: `El día «${dayTitle}» ya no pertenece a esta rutina.`,
            stillApplied: async () => Boolean(await driver.first(
              'SELECT id FROM days WHERE id = ? AND routine_id = ? AND title = ? AND sort = ? AND archived_at IS NULL',
              dayId,
              routineId,
              dayTitle,
              dayIndex
            )),
          });
        }
        for (const [dayIndex, day] of draft.days.entries()) {
          if (day.id === null) continue;
          const dayId = day.id;
          for (const [exerciseIndex, exercise] of day.exercises.entries()) {
            if (exercise.id === null) continue;
            const exerciseName = exercise.name.trim();
            const exerciseId = exercise.id;
            planned.push({
              stmt: {
                sql: `UPDATE exercises SET name = ?, sets = ?, reps = ?, sort = ?, archived_at = NULL
                      WHERE id = ? AND day_id = ?
                        AND EXISTS (
                          SELECT 1 FROM days d JOIN routines r ON r.id = d.routine_id
                          WHERE d.id = ? AND r.id = ? AND r.archived_at IS NULL
                        )`,
                params: [exerciseName, exercise.sets, exercise.reps, exerciseIndex, exerciseId, dayId, dayId, routineId],
              },
              error: `El ejercicio «${exerciseName}» ya no pertenece a este día.`,
              stillApplied: async () => Boolean(await driver.first(
                `SELECT id FROM exercises
                 WHERE id = ? AND day_id = ? AND name = ? AND sets = ? AND reps = ? AND sort = ? AND archived_at IS NULL`,
                exerciseId,
                dayId,
                exerciseName,
                exercise.sets,
                exercise.reps,
                exerciseIndex
              )),
            });
          }
        }
      } else {
        planned.push({
          stmt: {
            sql: 'INSERT INTO routines (id, title, level, sort, archived_at) VALUES (?, ?, ?, ?, NULL)',
            params: [routineId, title, level, draft.sort],
          },
          error: 'No se pudo guardar la rutina.',
          stillApplied: async () => Boolean(await driver.first('SELECT id FROM routines WHERE id = ?', routineId)),
        });
      }

      const dayUids = new Map<number, string>();
      for (const [dayIndex, day] of draft.days.entries()) {
        if (day.id !== null) continue;
        const dayUid = createUid();
        dayUids.set(dayIndex, dayUid);
        planned.push({
          stmt: {
            sql: 'INSERT INTO days (uid, routine_id, title, sort, archived_at) VALUES (?, ?, ?, ?, NULL)',
            params: [dayUid, routineId, day.title.trim(), dayIndex],
          },
          error: 'No se pudo guardar la rutina.',
          stillApplied: async () => Boolean(await driver.first('SELECT id FROM days WHERE uid = ?', dayUid)),
        });
      }
      for (const [dayIndex, day] of draft.days.entries()) {
        for (const [exerciseIndex, exercise] of day.exercises.entries()) {
          if (exercise.id !== null) continue;
          const exerciseUid = createUid();
          const params: SqlValue[] = day.id === null
            ? [exerciseUid, dayUids.get(dayIndex) ?? '', exercise.name.trim(), exercise.sets, exercise.reps, exerciseIndex]
            : [exerciseUid, day.id, exercise.name.trim(), exercise.sets, exercise.reps, exerciseIndex];
          planned.push({
            stmt: {
              sql: day.id === null
                ? `INSERT INTO exercises (uid, day_id, name, sets, reps, sort, archived_at)
                   VALUES (?, (SELECT id FROM days WHERE uid = ?), ?, ?, ?, ?, NULL)`
                : `INSERT INTO exercises (uid, day_id, name, sets, reps, sort, archived_at)
                   VALUES (?, ?, ?, ?, ?, ?, NULL)`,
              params,
            },
            error: 'No se pudo guardar la rutina.',
            stillApplied: async () => Boolean(await driver.first('SELECT id FROM exercises WHERE uid = ?', exerciseUid)),
          });
        }
      }

      await driver.exclusive(async () => {
        await applyPlanned(planned);
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
      await driver.exclusive(async () => {
        const current = await driver.first<{ id: string }>(
          'SELECT id FROM routines WHERE id = ? AND archived_at IS NULL',
          id
        );
        if (!current) return;
        const available = await driver.all<{ id: string }>(
          'SELECT id FROM routines WHERE archived_at IS NULL ORDER BY sort, title COLLATE NOCASE'
        );
        const active = await driver.first<{ value: string }>(
          "SELECT value FROM settings WHERE key = 'activeRoutineId'"
        );
        const stmts: Stmt[] = [
          { sql: 'UPDATE routines SET archived_at = ? WHERE id = ? AND archived_at IS NULL', params: [now, id] },
          {
            sql: 'UPDATE days SET archived_at = ? WHERE routine_id = ? AND archived_at IS NULL',
            params: [now, id],
          },
          {
            sql: `UPDATE exercises SET archived_at = ?
                  WHERE archived_at IS NULL AND day_id IN (SELECT id FROM days WHERE routine_id = ?)`,
            params: [now, id],
          },
        ];
        if (active?.value === id) {
          const nextActiveId = available.find((routine) => routine.id !== id)?.id ?? '';
          stmts.push({
            sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            params: ['activeRoutineId', nextActiveId],
          });
        }
        await driver.batch(stmts);
      });
    },

    async listDays(routineId) {
      const selectedRoutineId = routineId ?? (await activeRoutineId());
      if (!selectedRoutineId) return [];
      return driver.all<Day>(
        `SELECT id, routine_id AS routineId, title, sort FROM days
         WHERE routine_id = ? AND archived_at IS NULL ORDER BY sort, id`,
        selectedRoutineId
      );
    },

    async listExercises(dayId) {
      return driver.all<Exercise>(
        `SELECT id, day_id AS dayId, name, sets, reps, sort FROM exercises
         WHERE day_id = ? AND archived_at IS NULL ORDER BY sort, id`,
        dayId
      );
    },

    async getOpenSession(dayId) {
      const row = await driver.first<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE day_id = ? AND status = 'open' ORDER BY started_at DESC, id DESC LIMIT 1`,
        dayId
      );
      if (!row) return null;
      const marks = await marksFor([row.id]);
      return mapSession(row, marks.get(row.id) ?? {});
    },

    async listOpenSessions() {
      const routineId = await activeRoutineId();
      if (!routineId) return [];
      const rows = await driver.all<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE routine_id = ? AND status = 'open'
         ORDER BY COALESCE(last_used_at, started_at) DESC, id DESC`,
        routineId
      );
      return sessionsWithMarks(rows);
    },

    getSessionDetails,

    async getOrCreateOpenSession(dayId) {
      return driver.exclusive(async () => {
        const now = new Date().toISOString();
        const existing = await driver.first<{ id: number }>(
          `SELECT id FROM sessions
           WHERE day_id = ? AND status = 'open' ORDER BY started_at DESC, id DESC LIMIT 1`,
          dayId
        );
        if (existing) {
          await driver.run(
            'UPDATE sessions SET last_used_at = ? WHERE id = ? AND status = ?',
            now,
            existing.id,
            'open'
          );
          const details = await getSessionDetails(existing.id);
          if (!details) throw new DomainError('No se pudo abrir la sesión.');
          return details;
        }

        const day = await driver.first<{
          id: number;
          title: string;
          routineId: string;
          routineTitle: string;
        }>(
          `SELECT d.id, d.title, d.routine_id AS routineId, r.title AS routineTitle
           FROM days d JOIN routines r ON r.id = d.routine_id
           WHERE d.id = ? AND d.archived_at IS NULL AND r.archived_at IS NULL`,
          dayId
        );
        if (!day) throw new DomainError('No encontramos ese día en tu rutina.');
        const exercises = await driver.all<Exercise>(
          `SELECT id, day_id AS dayId, name, sets, reps, sort FROM exercises
           WHERE day_id = ? AND archived_at IS NULL ORDER BY sort, id`,
          dayId
        );
        const sessionUid = createUid();
        const stmts: Stmt[] = [{
          sql: `INSERT INTO sessions
                  (uid, day_id, started_at, completed_at, completed_sets, status, routine_id, routine_title, day_title, last_used_at)
                SELECT ?, ?, ?, NULL, '{}', 'open', ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE day_id = ? AND status = 'open')`,
          params: [sessionUid, dayId, now, day.routineId, day.routineTitle, day.title, now, dayId],
        }];
        for (const exercise of exercises) {
          const exerciseUid = createUid();
          stmts.push({
            sql: `INSERT INTO session_exercises
                    (uid, session_id, source_exercise_id, name, sets, reps, sort)
                  SELECT ?, id, ?, ?, ?, ?, ?
                  FROM sessions WHERE uid = ? AND status = 'open'`,
            params: [exerciseUid, exercise.id, exercise.name, exercise.sets, exercise.reps, exercise.sort, sessionUid],
          });
          for (let index = 0; index < exercise.sets; index++) {
            stmts.push({
              sql: `INSERT INTO session_sets (uid, session_exercise_id, set_index, completed)
                    SELECT ?, id, ?, 0 FROM session_exercises WHERE uid = ?`,
              params: [createUid(), index, exerciseUid],
            });
          }
        }
        try {
          await driver.batch(stmts);
        } catch (error) {
          if (!isUniqueConstraint(error)) throw error;
        }
        const opened = await driver.first<{ id: number }>(
          `SELECT id FROM sessions
           WHERE day_id = ? AND status = 'open' ORDER BY started_at DESC, id DESC LIMIT 1`,
          dayId
        );
        if (!opened) throw new DomainError('No se pudo abrir la sesión.');
        await driver.run('UPDATE sessions SET last_used_at = ? WHERE id = ?', now, opened.id);
        const details = await getSessionDetails(opened.id);
        if (!details) throw new DomainError('No se pudo abrir la sesión.');
        return details;
      });
    },

    async updateSessionSet(sessionId, exerciseId, setIndex, patch) {
      if (patch.weightKg !== undefined) assertWeight(patch.weightKg);
      if (patch.actualReps !== undefined) assertReps(patch.actualReps);
      await driver.exclusive(async () => {
        const exercise = await driver.first<{ id: number; sets: number }>(
          'SELECT id, sets FROM session_exercises WHERE session_id = ? AND source_exercise_id = ?',
          sessionId,
          exerciseId
        );
        if (!exercise || !Number.isSafeInteger(setIndex) || setIndex < 0 || setIndex >= exercise.sets) {
          throw new DomainError('Esa serie ya no está disponible.');
        }
        const session = await driver.first<{ status: string }>(
          'SELECT status FROM sessions WHERE id = ?',
          sessionId
        );
        if (session?.status !== 'open') throw new DomainError('La sesión ya está cerrada.');
        const current = await driver.first<{
          completed: number;
          weight_kg: number | null;
          actual_reps: number | null;
        }>(
          `SELECT completed, weight_kg, actual_reps FROM session_sets
           WHERE session_exercise_id = ? AND set_index = ?`,
          exercise.id,
          setIndex
        );
        if (!current) throw new DomainError('No encontramos los datos de esa serie.');
        const completed = patch.completed ?? Boolean(current.completed);
        const weightKg = patch.weightKg === undefined ? current.weight_kg : patch.weightKg;
        const actualReps = patch.actualReps === undefined ? current.actual_reps : patch.actualReps;
        assertWeight(weightKg);
        assertReps(actualReps);
        const now = new Date().toISOString();
        const results = await driver.batch([
          {
            sql: `UPDATE session_sets SET completed = ?, weight_kg = ?, actual_reps = ?
                  WHERE session_exercise_id = ? AND set_index = ?
                    AND EXISTS (
                      SELECT 1 FROM sessions s
                      JOIN session_exercises se ON se.session_id = s.id
                      WHERE se.id = session_sets.session_exercise_id AND s.id = ? AND s.status = 'open'
                    )`,
            params: [completed ? 1 : 0, weightKg, actualReps, exercise.id, setIndex, sessionId],
          },
          {
            sql: "UPDATE sessions SET last_used_at = ? WHERE id = ? AND status = 'open'",
            params: [now, sessionId],
          },
        ]);
        if (results[0].changes > 0) return;
        const again = await driver.first<{ status: string }>(
          'SELECT status FROM sessions WHERE id = ?',
          sessionId
        );
        if (again?.status !== 'open') throw new DomainError('La sesión ya está cerrada.');
        throw new DomainError('Esa serie ya no está disponible.');
      });
    },

    async finishSession(sessionId, completedAtIso) {
      return driver.exclusive(async () => {
        const preview = await readProgress(driver, sessionId);
        if (!preview || preview.completed === 0) {
          throw new DomainError('Marcá al menos una serie antes de finalizar.', 422);
        }
        if (preview.status !== 'open') throw new DomainError('La sesión ya estaba finalizada.');
        const status: SessionStatus = preview.completed === preview.total ? 'completed' : 'partial';
        const result = await driver.run(
          `UPDATE sessions SET status = ?, completed_at = ?
           WHERE id = ? AND status = 'open'
             AND (
               SELECT COALESCE(SUM(ss.completed), 0)
               FROM session_exercises se JOIN session_sets ss ON ss.session_exercise_id = se.id
               WHERE se.session_id = sessions.id
             ) > 0`,
          status,
          completedAtIso,
          sessionId
        );
        if (result.changes === 0) {
          const again = await readProgress(driver, sessionId);
          if (!again || again.completed === 0) {
            throw new DomainError('Marcá al menos una serie antes de finalizar.', 422);
          }
          throw new DomainError('La sesión ya estaba finalizada.');
        }
        return status;
      });
    },

    async reopenSession(sessionId) {
      await driver.exclusive(async () => {
        const result = await driver.run(
          `UPDATE sessions SET status = 'open', completed_at = NULL
           WHERE id = ? AND status IN ('completed', 'partial')
             AND NOT EXISTS (
               SELECT 1 FROM sessions AS other
               WHERE other.day_id = sessions.day_id
                 AND other.status = 'open'
                 AND other.id != sessions.id
             )`,
          sessionId
        );
        if (result.changes > 0) return;
        const other = await driver.first<{ id: number }>(
          `SELECT id FROM sessions
           WHERE day_id = (SELECT day_id FROM sessions WHERE id = ?)
             AND status = 'open' AND id != ?`,
          sessionId,
          sessionId
        );
        if (other) throw new DomainError('Ya hay otra sesión abierta para este día.');
        throw new DomainError('No se pudo reabrir la sesión.');
      });
    },

    async discardEmptySession(sessionId) {
      await driver.exclusive(async () => {
        const result = await driver.run(
          `DELETE FROM sessions
           WHERE id = ? AND status = 'open'
             AND NOT EXISTS (
               SELECT 1 FROM session_exercises se
               JOIN session_sets ss ON ss.session_exercise_id = se.id
               WHERE se.session_id = sessions.id AND ss.completed = 1
             )`,
          sessionId
        );
        if (result.changes === 0) throw new DomainError('Solo se puede descartar una sesión vacía.');
      });
    },

    async previousExerciseSets(routineId, exerciseId) {
      const prior = await driver.first<{ id: number }>(
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
      const rows = await driver.all<{
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
      if (patch.weightKg !== undefined) assertWeight(patch.weightKg);
      if (patch.actualReps !== undefined) assertReps(patch.actualReps);
      await driver.exclusive(async () => {
        const current = await driver.first<{
          weightKg: number | null;
          actualReps: number | null;
          completed: number;
        }>(
          `SELECT weight_kg AS weightKg, actual_reps AS actualReps, completed
           FROM session_sets
           WHERE id = ? AND session_exercise_id IN (
             SELECT se.id FROM session_exercises se
             JOIN sessions s ON s.id = se.session_id
             WHERE s.status IN ('completed', 'partial')
           )`,
          setId
        );
        if (!current || !current.completed) throw new DomainError('Solo podés corregir una serie realizada.');
        const weightKg = patch.weightKg === undefined ? current.weightKg : patch.weightKg;
        const actualReps = patch.actualReps === undefined ? current.actualReps : patch.actualReps;
        const result = await driver.run(
          `UPDATE session_sets SET weight_kg = ?, actual_reps = ?
           WHERE id = ? AND completed = 1
             AND session_exercise_id IN (
               SELECT se.id FROM session_exercises se
               JOIN sessions s ON s.id = se.session_id
               WHERE s.status IN ('completed', 'partial')
             )`,
          weightKg,
          actualReps,
          setId
        );
        if (result.changes === 0) throw new DomainError('Solo podés corregir una serie realizada.');
      });
    },

    async lastCompleted(routineId) {
      const selectedRoutine = routineId ?? (await activeRoutineId());
      if (!selectedRoutine) return null;
      const row = await driver.first<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE routine_id = ? AND status IN ('completed', 'partial')
         ORDER BY completed_at DESC, id DESC LIMIT 1`,
        selectedRoutine
      );
      if (!row) return null;
      const marks = await marksFor([row.id]);
      return asCompleted(row, marks.get(row.id) ?? {});
    },

    async listCompleted(limit, offset = 0, routineId) {
      const selectedRoutine = routineId === undefined ? await activeRoutineId() : routineId;
      const condition = selectedRoutine === null ? '' : 'AND routine_id = ?';
      const query = `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE status IN ('completed', 'partial') ${condition}
         ORDER BY completed_at DESC, id DESC LIMIT ? OFFSET ?`;
      const rows = selectedRoutine === null
        ? await driver.all<SessionRow>(query, limit, offset)
        : await driver.all<SessionRow>(query, selectedRoutine, limit, offset);
      const marks = await marksFor(rows.map((row) => row.id));
      return rows.map((row) => asCompleted(row, marks.get(row.id) ?? {}));
    },

    async listRoutineHistory() {
      return listRoutines(true);
    },

    async getHomeSnapshot() {
      const [routines, settingRow, dayRows, exerciseRows, openRows, openMarks, recentRows, recentMarks] = await driver.batch([
        {
          sql: `SELECT id, title, level, sort, archived_at AS archivedAt
                FROM routines ORDER BY sort ASC, title COLLATE NOCASE ASC`,
        },
        { sql: "SELECT value FROM settings WHERE key = 'activeRoutineId'" },
        {
          sql: `SELECT id, routine_id AS routineId, title, sort FROM days
                WHERE archived_at IS NULL AND routine_id = ${CHOSEN_ROUTINE_ID}
                ORDER BY sort, id`,
        },
        {
          sql: `SELECT e.id, e.day_id AS dayId, e.name, e.sets, e.reps, e.sort
                FROM exercises e JOIN days d ON d.id = e.day_id
                WHERE e.archived_at IS NULL AND d.archived_at IS NULL
                  AND d.routine_id = ${CHOSEN_ROUTINE_ID}
                ORDER BY d.sort, d.id, e.sort, e.id`,
        },
        {
          sql: `SELECT ${SESSION_COLUMNS} FROM sessions
                WHERE status = 'open' AND routine_id = ${CHOSEN_ROUTINE_ID}
                ORDER BY COALESCE(last_used_at, started_at) DESC, id DESC`,
        },
        {
          sql: `SELECT se.session_id AS sessionId, se.source_exercise_id AS sourceExerciseId,
                       ss.set_index AS setIndex, ss.completed
                FROM session_exercises se
                JOIN session_sets ss ON ss.session_exercise_id = se.id
                JOIN sessions s ON s.id = se.session_id
                WHERE s.status = 'open' AND s.routine_id = ${CHOSEN_ROUTINE_ID}
                ORDER BY se.sort, ss.set_index`,
        },
        {
          sql: `SELECT ${SESSION_COLUMNS} FROM sessions
                WHERE status IN ('completed', 'partial') AND routine_id = ${CHOSEN_ROUTINE_ID}
                ORDER BY completed_at DESC, id DESC LIMIT 3`,
        },
        {
          sql: `SELECT se.session_id AS sessionId, se.source_exercise_id AS sourceExerciseId,
                       ss.set_index AS setIndex, ss.completed
                FROM session_exercises se
                JOIN session_sets ss ON ss.session_exercise_id = se.id
                WHERE se.session_id IN (
                  SELECT id FROM sessions
                  WHERE status IN ('completed', 'partial') AND routine_id = ${CHOSEN_ROUTINE_ID}
                  ORDER BY completed_at DESC, id DESC LIMIT 3
                )
                ORDER BY se.sort, ss.set_index`,
        },
      ]);
      const routineRows = routines.rows as { id: string; title: string; level: string; sort: number; archivedAt: string | null }[];
      const stored = (settingRow.rows[0] as { value: string } | undefined)?.value ?? null;
      const routine = pickActiveRoutine(
        routineRows.map((row) => ({ ...row, archivedAt: row.archivedAt ?? null })),
        stored
      );
      const exercisesByDay = new Map<number, Exercise[]>();
      for (const exercise of exerciseRows.rows as Exercise[]) {
        const list = exercisesByDay.get(exercise.dayId) ?? [];
        list.push(exercise);
        exercisesByDay.set(exercise.dayId, list);
      }
      const openMarksBySession = groupMarks(openMarks.rows as MarkRow[]);
      const openSessions = (openRows.rows as SessionRow[]).map((row) =>
        mapSession(row, openMarksBySession.get(row.id) ?? {})
      );
      const openByDay = new Map(openSessions.map((session) => [session.dayId, session]));
      const days = (dayRows.rows as Day[]).map((day) => ({
        day,
        exercises: exercisesByDay.get(day.id) ?? [],
        open: openByDay.get(day.id) ?? null,
      }));
      const recentMarkMap = groupMarks(recentMarks.rows as MarkRow[]);
      const recent = (recentRows.rows as SessionRow[]).map((row) =>
        asCompleted(row, recentMarkMap.get(row.id) ?? {})
      );
      return {
        routine,
        days: routine ? days.filter((item) => item.day.routineId === routine.id) : [],
        openSessions: routine ? openSessions.filter((session) => session.routineId === routine.id) : [],
        lastCompleted: recent[0] ?? null,
        recent,
      };
    },

    async getSetState(sessionId, exerciseId, setIndex) {
      const row = await driver.first<{ completed: number; status: SessionStatus }>(
        `SELECT ss.completed AS completed, s.status AS status
         FROM sessions s
         JOIN session_exercises se ON se.session_id = s.id
         JOIN session_sets ss ON ss.session_exercise_id = se.id
         WHERE s.id = ? AND se.source_exercise_id = ? AND ss.set_index = ?`,
        sessionId,
        exerciseId,
        setIndex
      );
      if (!row) return null;
      return { completed: Boolean(row.completed), status: row.status };
    },
  };
}

async function readProgress(driver: SqlDriver, sessionId: number): Promise<{ status: string; total: number; completed: number } | null> {
  const session = await driver.first<{ status: string }>(
    'SELECT status FROM sessions WHERE id = ?',
    sessionId
  );
  if (!session) return null;
  const counts = await driver.first<{ total: number; completed: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(ss.completed), 0) AS completed
     FROM session_exercises se JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE se.session_id = ?`,
    sessionId
  );
  return { status: session.status, total: Number(counts?.total ?? 0), completed: Number(counts?.completed ?? 0) };
}
