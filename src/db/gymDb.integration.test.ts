/** @jest-environment node */

import { registerRepositoryContract } from '@/db/repository.contract';
import { migrate } from '@/db/schema';
import { createSqliteTestAdapter } from '@/db/sqliteTestAdapter';

registerRepositoryContract((name, run) => {
  it(name, run);
}, async () => {
  const opened = createSqliteTestAdapter();
  await opened.db.execAsync('PRAGMA foreign_keys = ON');
  await migrate(opened.db);
  return { driver: opened.driver, close: opened.close };
});
