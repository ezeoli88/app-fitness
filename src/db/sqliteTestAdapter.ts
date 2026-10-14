import type { SQLiteDatabase } from 'expo-sqlite';

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
declare const require: (name: string) => { DatabaseSync: new (name: string) => SqliteLike };

const { DatabaseSync } = require('node:sqlite');

/** SQLite's real engine behind the async surface used by expo-sqlite. */
export function createSqliteTestAdapter(): { db: SQLiteDatabase; close: () => void } {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).get(...params as SQLInputValue[]) as T | undefined,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params as SQLInputValue[]) as T[],
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = sqlite.prepare(sql).run(...params as SQLInputValue[]);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  } as Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync'> & Record<string, unknown>;

  const transaction = async (action: () => Promise<void>, immediate = false) => {
    sqlite.exec(immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
      await action();
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  };
  db.withTransactionAsync = (action: () => Promise<void>) => transaction(action);
  db.withExclusiveTransactionAsync = (action: (transaction: SQLiteDatabase) => Promise<void>) =>
    transaction(() => action(db as unknown as SQLiteDatabase), true);

  return { db: db as unknown as SQLiteDatabase, close: () => sqlite.close() };
}
