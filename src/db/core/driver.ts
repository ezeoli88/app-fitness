export type SqlValue = string | number | null;

export type Stmt = { sql: string; params?: SqlValue[] };

export type RunResult = { changes: number; lastInsertRowId: number };

export type BatchResult = { changes: number; rows: unknown[]; lastInsertRowId?: number };

/**
 * Puerto mínimo de SQL. `batch` es atómico: todas las sentencias se aplican en orden o ninguna.
 * D1 no ofrece transacciones interactivas, así que las escrituras se arman antes y entran juntas.
 */
export interface SqlDriver {
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  run(sql: string, ...params: SqlValue[]): Promise<RunResult>;
  batch(stmts: Stmt[]): Promise<BatchResult[]>;
  /**
   * Encola la tarea detrás de las escrituras anteriores del mismo driver.
   * `run` y `batch` llamados desde adentro no vuelven a esperar (reentrada).
   */
  exclusive<T>(task: () => Promise<T>): Promise<T>;
}

export function isSelect(sql: string): boolean {
  return /^\s*select\b/i.test(sql);
}

export function isUniqueConstraint(error: unknown): boolean {
  const message = errorText(error);
  return /UNIQUE constraint failed/i.test(message) || /SQLITE_CONSTRAINT/i.test(message);
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? error.cause.message : '';
    return `${error.message} ${cause}`;
  }
  return String(error);
}
