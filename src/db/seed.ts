import type { SQLiteDatabase } from 'expo-sqlite';

import type { RoutineJson } from '@/domain/types';

export async function seedCatalog(db: SQLiteDatabase, catalog: RoutineJson[]): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const [sort, routine] of catalog.entries()) {
      const existing = await tx.getFirstAsync<{ id: string }>(
        'SELECT id FROM routines WHERE id = ?',
        routine.id
      );
      if (existing) continue;

      await tx.runAsync(
        'INSERT INTO routines (id, title, level, sort) VALUES (?, ?, ?, ?)',
        routine.id,
        routine.titulo,
        routine.nivel,
        sort
      );

      for (const [index, day] of routine.dias.entries()) {
        const inserted = await tx.runAsync(
          'INSERT INTO days (routine_id, title, sort) VALUES (?, ?, ?)',
          routine.id,
          day.titulo,
          index
        );
        const dayId = inserted.lastInsertRowId;
        for (const [exIndex, exercise] of day.ejercicios.entries()) {
          await tx.runAsync(
            'INSERT INTO exercises (day_id, name, sets, reps, sort) VALUES (?, ?, ?, ?, ?)',
            dayId,
            exercise.nombre,
            exercise.series,
            exercise.reps,
            exIndex
          );
        }
      }
    }
  });
}
