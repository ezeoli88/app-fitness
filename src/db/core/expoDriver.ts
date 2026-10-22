import type { SQLiteDatabase } from 'expo-sqlite';

import { isSelect, type BatchResult, type SqlDriver, type SqlValue } from '@/db/core/driver';
import { createWriteQueue } from '@/db/core/queue';

const queues = new WeakMap<SQLiteDatabase, ReturnType<typeof createWriteQueue>>();

function queueFor(db: SQLiteDatabase) {
  let queue = queues.get(db);
  if (!queue) {
    queue = createWriteQueue();
    queues.set(db, queue);
  }
  return queue;
}

/** Envuelve expo-sqlite. `batch` corre dentro de una transacción exclusiva. */
export function createExpoDriver(db: SQLiteDatabase): SqlDriver {
  const enqueue = queueFor(db);
  return {
    all: (sql, ...params) => db.getAllAsync(sql, ...params),
    first: async <T>(sql: string, ...params: SqlValue[]) =>
      (await db.getFirstAsync<T>(sql, ...params)) ?? null,
    run: (sql, ...params) => enqueue(async () => {
      const result = await db.runAsync(sql, ...params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    }),
    batch: (stmts) => enqueue(async () => {
      const results: BatchResult[] = [];
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const stmt of stmts) {
          const params = stmt.params ?? [];
          if (isSelect(stmt.sql)) {
            const rows = await tx.getAllAsync(stmt.sql, ...params);
            results.push({ changes: 0, rows });
          } else {
            const result = await tx.runAsync(stmt.sql, ...params);
            results.push({
              changes: result.changes,
              lastInsertRowId: result.lastInsertRowId,
              rows: [],
            });
          }
        }
      });
      return results;
    }),
    exclusive: (task) => enqueue(task),
  };
}
