import type { SQLiteDatabase } from 'expo-sqlite';

const pending = new WeakMap<SQLiteDatabase, Promise<unknown>>();

/** All writers sharing a connection enter in invocation order, even after a failed write. */
export function serializeWrite<T>(db: SQLiteDatabase, write: () => Promise<T>): Promise<T> {
  const next = (pending.get(db) ?? Promise.resolve()).catch(() => undefined).then(write);
  pending.set(db, next.catch(() => undefined));
  return next;
}

export function writeTransaction(db: SQLiteDatabase, write: (tx: SQLiteDatabase) => Promise<void>): Promise<void> {
  return serializeWrite(db, () => db.withExclusiveTransactionAsync(write));
}
