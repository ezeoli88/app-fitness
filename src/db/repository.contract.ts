import { createGymDb } from '@/db/gymDb';
import { createSqlSettings } from '@/db/settings';
import type { SqlDriver } from '@/db/core/driver';
import type { RoutineDraft } from '@/domain/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same(actual: unknown, expected: unknown, message = 'valor distinto'): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nactual: ${left}\nexpected: ${right}`);
}

async function rejects(run: () => Promise<unknown>, pattern: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(pattern)) throw new Error(`Se esperaba «${pattern}» y llegó «${message}»`);
    return;
  }
  throw new Error(`Se esperaba un error con «${pattern}»`);
}

function sampleRoutine(): RoutineDraft {
  return {
    id: null,
    title: 'Fuerza',
    level: 'personalizada',
    sort: 0,
    days: [{
      id: null,
      title: 'Día A',
      sort: 0,
      exercises: [{ id: null, name: 'Sentadilla', sets: 2, reps: 8, sort: 0 }],
    }],
  };
}

export function registerRepositoryContract(
  test: (name: string, run: () => Promise<void>) => void,
  open: () => Promise<{ driver: SqlDriver; close: () => void | Promise<void> }>
): void {
  async function withDriver(run: (driver: SqlDriver) => Promise<void>): Promise<void> {
    const opened = await open();
    try {
      await run(opened.driver);
    } finally {
      await opened.close();
    }
  }

  test('serializes rapid writes across repository instances and recovers after a failed write', () => withDriver(async (driver) => {
    const gym = createGymDb(driver);
    const other = createGymDb(driver);
    const settings = createSqlSettings(driver);
    const id = await gym.saveRoutine(sampleRoutine());
    const day = (await gym.listDays(id))[0];
    const [a, b] = await Promise.all([gym.getOrCreateOpenSession(day.id), other.getOrCreateOpenSession(day.id)]);
    assert(a.id === b.id, 'dos aperturas en paralelo deben compartir la sesión');
    const exerciseId = a.exercises[0].sourceExerciseId;
    const results = await Promise.allSettled([
      gym.updateSessionSet(a.id, exerciseId, 0, { weightKg: 1 }),
      other.updateSessionSet(a.id, exerciseId, 0, { actualReps: 0 }),
      settings.set('theme', 'light'),
      other.updateSessionSet(a.id, exerciseId, 0, { weightKg: 12.5, actualReps: 8, completed: true }),
    ]);
    same(results.map((result) => result.status), ['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
    same((await gym.getSessionDetails(a.id))?.exercises[0].series[0], {
      ...((await gym.getSessionDetails(a.id))?.exercises[0].series[0]),
      weightKg: 12.5,
      actualReps: 8,
      completed: true,
    });
    await gym.finishSession(a.id, new Date().toISOString());
    await gym.reopenSession(a.id);
    assert((await gym.getSessionDetails(a.id))?.exercises[0].series[0].completed === true, 'reabrir conserva la serie');
    await gym.finishSession(a.id, new Date().toISOString());
    await gym.getOrCreateOpenSession(day.id);
    await rejects(() => gym.reopenSession(a.id), 'otra sesión abierta');
    same(await settings.get('theme'), 'light');
  }));

  test('paginates beyond 50 records and keeps archived history available', () => withDriver(async (driver) => {
    const gym = createGymDb(driver);
    const id = await gym.saveRoutine(sampleRoutine());
    const day = (await gym.listDays(id))[0];
    for (let index = 0; index < 61; index++) {
      const session = await gym.getOrCreateOpenSession(day.id);
      await gym.updateSessionSet(session.id, session.exercises[0].sourceExerciseId, 0, { completed: true });
      await gym.finishSession(session.id, new Date(Date.UTC(2026, 0, index + 1)).toISOString());
    }
    const pages = await Promise.all([0, 20, 40, 60].map((offset) => gym.listCompleted(20, offset, id)));
    same(pages.map((page) => page.length), [20, 20, 20, 1]);
    assert(new Set(pages.flat().map((session) => session.id)).size === 61, 'las páginas no deben repetir sesiones');
    await gym.archiveRoutine(id);
    assert(await gym.getActiveRoutine() === null, 'no queda rutina activa');
    assert((await gym.listCompleted(20, 0, null)).length === 20, 'el historial archivado sigue visible');
    assert((await gym.listRoutineHistory())[0].archivedAt, 'la rutina queda archivada');
  }));

  test('keeps open snapshots after replacements and prioritizes the most recently visited session', () => withDriver(async (driver) => {
    const gym = createGymDb(driver);
    const draft = sampleRoutine();
    draft.days.push({ ...draft.days[0], title: 'Día B' });
    const id = await gym.saveRoutine(draft);
    const days = await gym.listDays(id);
    const a = await gym.getOrCreateOpenSession(days[0].id);
    const b = await gym.getOrCreateOpenSession(days[1].id);
    await driver.run('UPDATE sessions SET last_used_at = ? WHERE id = ?', '2000-01-01T00:00:00.000Z', b.id);
    await gym.getOrCreateOpenSession(days[0].id);
    assert((await gym.listOpenSessions())[0].id === a.id, 'la sesión recién usada va primera');
    const edited = await gym.getRoutineDraft(id);
    assert(edited, 'el borrador existe');
    edited!.days[0].exercises[0] = { ...edited!.days[0].exercises[0], id: null, name: 'Press' };
    edited!.days.pop();
    await gym.saveRoutine(edited!);
    assert((await gym.getSessionDetails(a.id))?.exercises[0].name === 'Sentadilla', 'el snapshot conserva el nombre');
    assert((await gym.listExercises(days[0].id))[0].id !== a.exercises[0].sourceExerciseId, 'el reemplazo crea otro ejercicio');
    assert((await gym.getOrCreateOpenSession(days[1].id)).id === b.id, 'la sesión del día archivado sigue abierta');
    const archived = await driver.first<{ archived_at: string | null }>(
      'SELECT archived_at FROM exercises WHERE id = ?',
      b.exercises[0].sourceExerciseId
    );
    assert(archived?.archived_at, 'el ejercicio retirado queda archivado');
  }));

  test('saves partial sets, keeps a history snapshot across routine edits and paginates sessions', () => withDriver(async (driver) => {
    const gym = createGymDb(driver);
    const routineId = await gym.saveRoutine(sampleRoutine());
    const day = (await gym.listDays(routineId))[0];
    const originalExercise = (await gym.listExercises(day.id))[0];
    const open = await gym.getOrCreateOpenSession(day.id);
    const sameOpen = await gym.getOrCreateOpenSession(day.id);
    assert(sameOpen.id === open.id, 'reabrir el día devuelve la misma sesión');
    await gym.updateSessionSet(open.id, originalExercise.id, 0, { completed: true, weightKg: 0, actualReps: 7 });
    const stored = await driver.first<{ completed_sets: string }>('SELECT completed_sets FROM sessions WHERE id = ?', open.id);
    same(stored?.completed_sets, '{}', 'completed_sets deja de usarse como caché');
    await rejects(() => gym.updateSessionSet(open.id, originalExercise.id, 1, { actualReps: 0 }), 'entero positivo');
    same(await gym.finishSession(open.id, '2026-09-25T12:00:00.000Z'), 'partial');

    const edited = await gym.getRoutineDraft(routineId);
    assert(edited, 'el borrador existe');
    edited!.title = 'Fuerza 2';
    edited!.days[0].exercises[0].name = 'Sentadilla frontal';
    edited!.days[0].exercises[0].reps = 10;
    await gym.saveRoutine(edited!);

    const historical = await gym.getSessionDetails(open.id);
    same(historical?.routineTitle, 'Fuerza');
    same(historical?.dayTitle, 'Día A');
    assert(historical?.exercises[0].name === 'Sentadilla', 'el historial no sigue el renombre');
    same(historical?.exercises[0].sets, 2);
    same(historical?.exercises[0].reps, 8);
    same(historical?.exercises[0].series[0].weightKg, 0);
    same(historical?.exercises[0].series[0].actualReps, 7);
    same(historical?.exercises[0].series[1].completed, false);

    const previous = await gym.previousExerciseSets(routineId, originalExercise.id);
    assert(previous.length === 2, 'la serie anterior trae el snapshot completo');
    same(previous[0].weightKg, 0);
    await gym.updateHistoricalSet(previous[0].id, { weightKg: 12.5 });
    same((await gym.getSessionDetails(open.id))?.exercises[0].series[0].weightKg, 12.5);
    assert((await gym.listCompleted(20, 0, routineId)).length === 1, 'la rutina tiene una sesión');
    assert((await gym.listCompleted(20, 0, 'other-routine')).length === 0, 'otra rutina no ve la sesión');
  }));

  test('duplicates without sharing source exercise identities and discards an empty session', () => withDriver(async (driver) => {
    const gym = createGymDb(driver);
    const routineId = await gym.saveRoutine(sampleRoutine());
    const originalExercise = (await gym.listExercises((await gym.listDays(routineId))[0].id))[0];
    const duplicateId = await gym.duplicateRoutine(routineId);
    assert(duplicateId, 'la copia existe');
    const copiedExercise = (await gym.listExercises((await gym.listDays(duplicateId!))[0].id))[0];
    assert(copiedExercise.id !== originalExercise.id, 'la copia no comparte ejercicios');
    same(await gym.previousExerciseSets(duplicateId!, copiedExercise.id), []);
    const open = await gym.getOrCreateOpenSession((await gym.listDays(routineId))[0].id);
    await gym.updateSessionSet(open.id, originalExercise.id, 0, { weightKg: 15 });
    await gym.discardEmptySession(open.id);
    assert(await gym.getSessionDetails(open.id) === null, 'la sesión vacía se descarta');
    same(await driver.first('SELECT COUNT(*) AS count FROM session_exercises'), { count: 0 });
    same(await driver.first('SELECT COUNT(*) AS count FROM session_sets'), { count: 0 });
  }));

  test('builds the home snapshot in one read and reports set state', () => withDriver(async (driver) => {
    const gym = createGymDb(driver);
    const routineId = await gym.saveRoutine(sampleRoutine());
    await gym.setActiveRoutine(routineId);
    const day = (await gym.listDays(routineId))[0];
    const session = await gym.getOrCreateOpenSession(day.id);
    await gym.updateSessionSet(session.id, session.exercises[0].sourceExerciseId, 0, { completed: true, weightKg: 10, actualReps: 8 });
    const home = await gym.getHomeSnapshot();
    same(home.routine?.id, routineId);
    same(home.days.map((item) => item.day.id), (await gym.listDays()).map((item) => item.id));
    same(home.days[0].exercises.map((exercise) => exercise.id), (await gym.listExercises(day.id)).map((exercise) => exercise.id));
    same(home.days[0].open?.id, session.id);
    assert(home.days[0].open?.completedSets[session.exercises[0].sourceExerciseId][0] === true, 'la home ve la serie marcada');
    same(await gym.getSetState(session.id, session.exercises[0].sourceExerciseId, 0), { completed: true, status: 'open' });
    same(await gym.getSetState(session.id, session.exercises[0].sourceExerciseId, 9), null);
  }));
}
