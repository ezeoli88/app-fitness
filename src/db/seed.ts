import type { SqlDriver, Stmt } from '@/db/core/driver';
import type { RoutineJson } from '@/domain/types';

/** Siembra el catálogo una sola vez. */
export async function seedCatalog(driver: SqlDriver, catalog: RoutineJson[]): Promise<void> {
  const existing = await driver.all<{ id: string }>('SELECT id FROM routines');
  const have = new Set(existing.map((row) => row.id));
  const stmts: Stmt[] = [];

  for (const [sort, routine] of catalog.entries()) {
    if (have.has(routine.id)) continue;
    stmts.push({
      sql: 'INSERT INTO routines (id, title, level, sort, archived_at) VALUES (?, ?, ?, ?, NULL)',
      params: [routine.id, routine.titulo, routine.nivel, sort],
    });
    for (const [index, day] of routine.dias.entries()) {
      stmts.push({
        sql: 'INSERT INTO days (routine_id, title, sort, archived_at) VALUES (?, ?, ?, NULL)',
        params: [routine.id, day.titulo, index],
      });
      for (const [exerciseIndex, exercise] of day.ejercicios.entries()) {
        stmts.push({
          sql: `INSERT INTO exercises (day_id, name, sets, reps, sort, archived_at)
                SELECT id, ?, ?, ?, ?, NULL FROM days
                WHERE routine_id = ? AND sort = ? AND archived_at IS NULL`,
          params: [exercise.nombre, exercise.series, exercise.reps, exerciseIndex, routine.id, index],
        });
      }
    }
  }

  if (stmts.length > 0) await driver.batch(stmts);
}
