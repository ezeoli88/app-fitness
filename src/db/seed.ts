import type { SqlDriver, Stmt } from '@/db/core/driver';
import type { RoutineJson } from '@/domain/types';

/** Siembra el catálogo una sola vez. Los uid de días y ejercicios son deterministas para la sync futura. */
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
      const dayUid = `${routine.id}:d${index}`;
      stmts.push({
        sql: 'INSERT INTO days (uid, routine_id, title, sort, archived_at) VALUES (?, ?, ?, ?, NULL)',
        params: [dayUid, routine.id, day.titulo, index],
      });
      for (const [exerciseIndex, exercise] of day.ejercicios.entries()) {
        stmts.push({
          sql: `INSERT INTO exercises (uid, day_id, name, sets, reps, sort, archived_at)
                VALUES (?, (SELECT id FROM days WHERE uid = ?), ?, ?, ?, ?, NULL)`,
          params: [`${dayUid}:e${exerciseIndex}`, dayUid, exercise.nombre, exercise.series, exercise.reps, exerciseIndex],
        });
      }
    }
  }

  if (stmts.length > 0) await driver.batch(stmts);
}
