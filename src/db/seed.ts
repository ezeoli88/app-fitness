import type { SQLiteDatabase } from 'expo-sqlite';

import type { RoutineJson } from '@/domain/types';

export async function seedIfEmpty(db: SQLiteDatabase, routine: RoutineJson): Promise<void> {
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM days');
  if ((row?.c ?? 0) > 0) return;

  for (const [index, day] of routine.dias.entries()) {
    await db.runAsync(
      'INSERT INTO days (id, title, sort) VALUES (?, ?, ?)',
      day.id,
      day.titulo,
      index
    );
    for (const [exIndex, exercise] of day.ejercicios.entries()) {
      await db.runAsync(
        'INSERT INTO exercises (day_id, name, sets, reps, sort) VALUES (?, ?, ?, ?, ?)',
        day.id,
        exercise.nombre,
        exercise.series,
        exercise.reps,
        exIndex
      );
    }
  }
}
