import type { SQLiteDatabase } from 'expo-sqlite';

import { createWriteQueue } from '@/db/core/queue';
import { isSelect, type BatchResult, type SqlDriver, type SqlValue, type Stmt } from '@/db/core/driver';

type SQLInputValue = null | string | number | bigint | Uint8Array;
type SqliteStatement = {
  get(...parameters: SQLInputValue[]): unknown;
  all(...parameters: SQLInputValue[]): unknown[];
  run(...parameters: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
};
type SqliteLike = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

declare const require: (name: string) => { DatabaseSync: new (path: string) => SqliteLike };

const { DatabaseSync } = require('node:sqlite');

function asParams(params: SqlValue[] | undefined): SQLInputValue[] {
  return (params ?? []) as SQLInputValue[];
}

function runStatement(sqlite: SqliteLike, stmt: Stmt): BatchResult {
  const prepared = sqlite.prepare(stmt.sql);
  if (isSelect(stmt.sql)) {
    return { changes: 0, rows: prepared.all(...asParams(stmt.params)) };
  }
  const result = prepared.run(...asParams(stmt.params));
  return {
    changes: Number(result.changes),
    lastInsertRowId: Number(result.lastInsertRowid),
    rows: [],
  };
}

/** SQLite de Node para Jest y para migrar el esquema de Android en las pruebas. */
export function openNodeSqlite(): { driver: SqlDriver; db: SQLiteDatabase; close: () => void } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const enqueue = createWriteQueue();

  const driver: SqlDriver = {
    all: async <T>(sql: string, ...params: SqlValue[]) =>
      sqlite.prepare(sql).all(...asParams(params)) as T[],
    first: async <T>(sql: string, ...params: SqlValue[]) => {
      const row = sqlite.prepare(sql).get(...asParams(params)) as T | undefined;
      return row ?? null;
    },
    run: (sql, ...params) => enqueue(async () => {
      const result = runStatement(sqlite, { sql, params });
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId ?? 0 };
    }),
    batch: (stmts) => enqueue(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      const results: BatchResult[] = [];
      try {
        for (const stmt of stmts) results.push(runStatement(sqlite, stmt));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        try { sqlite.exec('ROLLBACK'); } catch { /* La transacción ya fue revertida. */ }
        throw error;
      }
    }),
    exclusive: (task) => enqueue(task),
  };

  const db = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).get(...(params as SQLInputValue[])) as T | undefined,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...(params as SQLInputValue[])) as T[],
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = sqlite.prepare(sql).run(...(params as SQLInputValue[]));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  } as Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync'> & Record<string, unknown>;

  const transaction = async (action: () => Promise<void>, immediate = false) => {
    sqlite.exec(immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
      await action();
      sqlite.exec('COMMIT');
    } catch (error) {
      try { sqlite.exec('ROLLBACK'); } catch { /* Sin transacción activa. */ }
      throw error;
    }
  };
  db.withTransactionAsync = (action: () => Promise<void>) => transaction(action);
  db.withExclusiveTransactionAsync = (action: (transaction: SQLiteDatabase) => Promise<void>) =>
    transaction(() => action(db as unknown as SQLiteDatabase), true);

  return { driver, db: db as unknown as SQLiteDatabase, close: () => sqlite.close() };
}
