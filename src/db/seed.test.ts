/** @jest-environment node */

import catalogJson from '@/data/routines.json';
import { openNodeSqlite } from '@/db/core/nodeDriver';
import { migrate } from '@/db/schema';
import { seedCatalog } from '@/db/seed';
import type { RoutineJson } from '@/domain/types';

const catalog = catalogJson as RoutineJson[];

it('seeds the catalog once with deterministic uids', async () => {
  const opened = openNodeSqlite();
  try {
    await migrate(opened.db);
    await seedCatalog(opened.driver, catalog);
    await seedCatalog(opened.driver, catalog);
    const routines = await opened.driver.first<{ count: number }>('SELECT COUNT(*) AS count FROM routines');
    expect(routines).toEqual({ count: catalog.length });
    const days = await opened.driver.all<{ uid: string }>('SELECT uid FROM days ORDER BY sort, id');
    expect(days.map((day) => day.uid)).toEqual(['principiantes:d0', 'principiantes:d1', 'principiantes:d2']);
    const firstExercise = await opened.driver.first<{ uid: string }>(
      'SELECT uid FROM exercises WHERE day_id = (SELECT id FROM days WHERE uid = ?) ORDER BY sort, id LIMIT 1',
      'principiantes:d0'
    );
    expect(firstExercise).toEqual({ uid: 'principiantes:d0:e0' });
  } finally {
    opened.close();
  }
});
