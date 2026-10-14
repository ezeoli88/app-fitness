/** @jest-environment node */

import { createGymDb } from '@/db/gymDb';
import { migrate } from '@/db/schema';
import { createSqliteTestAdapter } from '@/db/sqliteTestAdapter';
import type { RoutineDraft } from '@/domain/types';
import { setSetting } from './settings';

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

describe('GymDb con SQLite real', () => {
  it('serializes rapid writes across repository instances and recovers after a failed write', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await migrate(db);
      const gym = createGymDb(db);
      const other = createGymDb(db);
      const id = await gym.saveRoutine(sampleRoutine());
      const day = (await gym.listDays(id))[0];
      const [a, b] = await Promise.all([gym.getOrCreateOpenSession(day.id), other.getOrCreateOpenSession(day.id)]);
      expect(a.id).toBe(b.id);
      const exerciseId = a.exercises[0].sourceExerciseId;
      const results = await Promise.allSettled([
        gym.updateSessionSet(a.id, exerciseId, 0, { weightKg: 1 }),
        other.updateSessionSet(a.id, exerciseId, 0, { actualReps: 0 }),
        setSetting(db, 'theme', 'light'),
        other.updateSessionSet(a.id, exerciseId, 0, { weightKg: 12.5, actualReps: 8, completed: true }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
      expect((await gym.getSessionDetails(a.id))?.exercises[0].series[0]).toMatchObject({ weightKg: 12.5, actualReps: 8, completed: true });
      await gym.finishSession(a.id, new Date().toISOString());
      await gym.reopenSession(a.id);
      expect((await gym.getSessionDetails(a.id))?.exercises[0].series[0]).toMatchObject({ weightKg: 12.5, completed: true });
      await gym.finishSession(a.id, new Date().toISOString());
      await gym.getOrCreateOpenSession(day.id);
      await expect(gym.reopenSession(a.id)).rejects.toThrow('otra sesión abierta');
    } finally { close(); }
  });

  it('paginates beyond 50 records and keeps archived history available', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await migrate(db);
      const gym = createGymDb(db);
      const id = await gym.saveRoutine(sampleRoutine());
      const day = (await gym.listDays(id))[0];
      for (let index = 0; index < 61; index++) {
        const session = await gym.getOrCreateOpenSession(day.id);
        await gym.updateSessionSet(session.id, session.exercises[0].sourceExerciseId, 0, { completed: true });
        await gym.finishSession(session.id, new Date(2026, 0, index + 1).toISOString());
      }
      const pages = await Promise.all([0, 20, 40, 60].map((offset) => gym.listCompleted(20, offset, id)));
      expect(pages.map((page) => page.length)).toEqual([20, 20, 20, 1]);
      expect(new Set(pages.flat().map((session) => session.id)).size).toBe(61);
      await gym.archiveRoutine(id);
      expect(await gym.getActiveRoutine()).toBeNull();
      expect(await gym.listCompleted(20, 0, null)).toHaveLength(20);
      expect((await gym.listRoutineHistory())[0].archivedAt).toBeTruthy();
    } finally { close(); }
  });

  it('keeps open snapshots after replacements and prioritizes the most recently visited session', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await migrate(db);
      const gym = createGymDb(db);
      const draft = sampleRoutine();
      draft.days.push({ ...draft.days[0], title: 'Día B' });
      const id = await gym.saveRoutine(draft);
      const days = await gym.listDays(id);
      const a = await gym.getOrCreateOpenSession(days[0].id);
      const b = await gym.getOrCreateOpenSession(days[1].id);
      await setSetting(db, `sessionLastUsed:${b.id}`, '2000-01-01');
      await gym.getOrCreateOpenSession(days[0].id);
      expect((await gym.listOpenSessions())[0].id).toBe(a.id);
      const edited = (await gym.getRoutineDraft(id))!;
      edited.days[0].exercises[0] = { ...edited.days[0].exercises[0], id: null, name: 'Press' };
      edited.days.pop();
      await gym.saveRoutine(edited);
      expect((await gym.getSessionDetails(a.id))?.exercises[0].name).toBe('Sentadilla');
      expect((await gym.listExercises(days[0].id))[0].id).not.toBe(a.exercises[0].sourceExerciseId);
      expect((await gym.getOrCreateOpenSession(days[1].id)).id).toBe(b.id);
      expect((await db.getFirstAsync<{ archived_at: string }>('SELECT archived_at FROM exercises WHERE id = ?', b.exercises[0].sourceExerciseId))?.archived_at).toBeTruthy();
    } finally { close(); }
  });

  it('saves partial sets, keeps a history snapshot across routine edits and paginates sessions', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await migrate(db);
      const gym = createGymDb(db);
      const routineId = await gym.saveRoutine(sampleRoutine());
      const day = (await gym.listDays(routineId))[0];
      const originalExercise = (await gym.listExercises(day.id))[0];
      const open = await gym.getOrCreateOpenSession(day.id);
      const sameOpen = await gym.getOrCreateOpenSession(day.id);
      expect(sameOpen.id).toBe(open.id);

      await gym.updateSessionSet(open.id, originalExercise.id, 0, { completed: true, weightKg: 0, actualReps: 7 });
      await expect(gym.updateSessionSet(open.id, originalExercise.id, 1, { actualReps: 0 })).rejects.toThrow('entero positivo');
      expect(await gym.finishSession(open.id, '2026-09-25T12:00:00.000Z')).toBe('partial');

      const edited = await gym.getRoutineDraft(routineId);
      expect(edited).not.toBeNull();
      edited!.title = 'Fuerza 2';
      edited!.days[0].exercises[0].name = 'Sentadilla frontal';
      edited!.days[0].exercises[0].reps = 10;
      await gym.saveRoutine(edited!);

      const historical = await gym.getSessionDetails(open.id);
      expect(historical?.routineTitle).toBe('Fuerza');
      expect(historical?.dayTitle).toBe('Día A');
      expect(historical?.exercises[0]).toMatchObject({ name: 'Sentadilla', sets: 2, reps: 8 });
      expect(historical?.exercises[0].series[0]).toMatchObject({ completed: true, weightKg: 0, actualReps: 7 });
      expect(historical?.exercises[0].series[1]).toMatchObject({ completed: false, weightKg: null, actualReps: null });

      const previous = await gym.previousExerciseSets(routineId, originalExercise.id);
      expect(previous).toHaveLength(2);
      expect(previous[0]).toMatchObject({ completed: true, weightKg: 0, actualReps: 7 });
      await gym.updateHistoricalSet(previous[0].id, { weightKg: 12.5 });
      expect((await gym.getSessionDetails(open.id))?.exercises[0].series[0].weightKg).toBe(12.5);
      expect(await gym.listCompleted(20, 0, routineId)).toHaveLength(1);
      expect(await gym.listCompleted(20, 0, 'other-routine')).toHaveLength(0);
    } finally {
      close();
    }
  });

  it('duplicates without sharing source exercise identities and discards an empty session', async () => {
    const { db, close } = createSqliteTestAdapter();
    try {
      await migrate(db);
      const gym = createGymDb(db);
      const routineId = await gym.saveRoutine(sampleRoutine());
      const originalExercise = (await gym.listExercises((await gym.listDays(routineId))[0].id))[0];
      const duplicateId = await gym.duplicateRoutine(routineId);
      expect(duplicateId).toBeTruthy();
      const copiedExercise = (await gym.listExercises((await gym.listDays(duplicateId!))[0].id))[0];
      expect(copiedExercise.id).not.toBe(originalExercise.id);
      expect(await gym.previousExerciseSets(duplicateId!, copiedExercise.id)).toEqual([]);

      const open = await gym.getOrCreateOpenSession((await gym.listDays(routineId))[0].id);
      await gym.updateSessionSet(open.id, originalExercise.id, 0, { weightKg: 15 });
      await gym.discardEmptySession(open.id);
      expect(await gym.getSessionDetails(open.id)).toBeNull();
      expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM session_exercises')).toEqual({ count: 0 });
      expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM session_sets')).toEqual({ count: 0 });
    } finally {
      close();
    }
  });
});
