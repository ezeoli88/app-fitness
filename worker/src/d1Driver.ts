import { createWriteQueue } from '@/db/core/queue';
import { isSelect, type BatchResult, type SqlDriver, type SqlValue, type Stmt } from '@/db/core/driver';

type D1Row = Record<string, unknown>;

function prepare(db: D1Database, stmt: Stmt) {
  const statement = db.prepare(stmt.sql);
  const params = stmt.params ?? [];
  return params.length === 0 ? statement : statement.bind(...params);
}

function rowsOf(result: D1Result<D1Row>, sql: string): unknown[] {
  if (!isSelect(sql)) return [];
  return result.results ?? [];
}

/** Un driver por request. La cola no cruza requests: el índice único y los WHERE cubren la carrera. */
export function createD1Driver(db: D1Database): SqlDriver {
  const enqueue = createWriteQueue();
  return {
    async all<T>(sql: string, ...params: SqlValue[]) {
      const result = await prepare(db, { sql, params }).all<T>();
      return result.results ?? [];
    },
    async first<T>(sql: string, ...params: SqlValue[]) {
      return (await prepare(db, { sql, params }).first<T>()) ?? null;
    },
    run: (sql, ...params) => enqueue(async () => {
      const result = await prepare(db, { sql, params }).run();
      return { changes: result.meta.changes ?? 0, lastInsertRowId: result.meta.last_row_id ?? 0 };
    }),
    batch: (stmts) => enqueue(async () => {
      if (stmts.length === 0) return [];
      const results = await db.batch<D1Row>(stmts.map((stmt) => prepare(db, stmt)));
      return results.map((result, index): BatchResult => ({
        changes: result.meta?.changes ?? 0,
        lastInsertRowId: result.meta?.last_row_id,
        rows: rowsOf(result, stmts[index].sql),
      }));
    }),
    exclusive: (task) => enqueue(task),
  };
}
