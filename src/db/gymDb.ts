import type { SQLiteDatabase } from 'expo-sqlite';

import type { CompletedSession, Day, Exercise, Session } from '@/domain/types';

type SessionRow = {
  id: number;
  day_id: number;
  started_at: string;
  completed_at: string | null;
  completed_sets: string;
};

type SessionWithTitleRow = SessionRow & { dayTitle: string };

export function serializeSets(sets: Record<number, boolean[]>): string {
  return JSON.stringify(sets);
}

export function parseSets(raw: string): Record<number, boolean[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean[]>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<number, boolean[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      out[Number(key)] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    dayId: row.day_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completedSets: parseSets(row.completed_sets),
  };
}

export type GymDb = {
  listDays(): Promise<Day[]>;
  listExercises(dayId: number): Promise<Exercise[]>;
  getOpenSession(dayId: number): Promise<Session | null>;
  getOrCreateOpenSession(dayId: number): Promise<Session>;
  saveOpenSession(session: Session): Promise<void>;
  closeSession(sessionId: number, completedAtIso: string): Promise<void>;
  reopenSession(sessionId: number, completedSets: Record<number, boolean[]>): Promise<void>;
  lastCompleted(): Promise<CompletedSession | null>;
  listCompleted(limit: number): Promise<CompletedSession[]>;
};

export function createGymDb(db: SQLiteDatabase): GymDb {
  return {
    async listDays() {
      const rows = await db.getAllAsync<{ id: number; title: string; sort: number }>(
        'SELECT id, title, sort FROM days ORDER BY sort ASC'
      );
      return rows;
    },

    async listExercises(dayId) {
      const rows = await db.getAllAsync<{
        id: number;
        day_id: number;
        name: string;
        sets: number;
        reps: number;
        sort: number;
      }>(
        'SELECT id, day_id, name, sets, reps, sort FROM exercises WHERE day_id = ? ORDER BY sort ASC',
        dayId
      );
      return rows.map((row) => ({
        id: row.id,
        dayId: row.day_id,
        name: row.name,
        sets: row.sets,
        reps: row.reps,
        sort: row.sort,
      }));
    },

    async getOpenSession(dayId) {
      const row = await db.getFirstAsync<SessionRow>(
        'SELECT id, day_id, started_at, completed_at, completed_sets FROM sessions WHERE day_id = ? AND completed_at IS NULL',
        dayId
      );
      return row ? mapSession(row) : null;
    },

    async getOrCreateOpenSession(dayId) {
      const open = await this.getOpenSession(dayId);
      if (open) return open;
      const startedAt = new Date().toISOString();
      const result = await db.runAsync(
        'INSERT INTO sessions (day_id, started_at, completed_at, completed_sets) VALUES (?, ?, NULL, ?)',
        dayId,
        startedAt,
        '{}'
      );
      return {
        id: result.lastInsertRowId,
        dayId,
        startedAt,
        completedAt: null,
        completedSets: {},
      };
    },

    async saveOpenSession(session) {
      await db.runAsync(
        'UPDATE sessions SET completed_sets = ? WHERE id = ? AND completed_at IS NULL',
        serializeSets(session.completedSets),
        session.id
      );
    },

    async closeSession(sessionId, completedAtIso) {
      await db.runAsync('UPDATE sessions SET completed_at = ? WHERE id = ?', completedAtIso, sessionId);
    },

    async reopenSession(sessionId, completedSets) {
      await db.runAsync(
        'UPDATE sessions SET completed_at = NULL, completed_sets = ? WHERE id = ?',
        serializeSets(completedSets),
        sessionId
      );
    },

    async lastCompleted() {
      const row = await db.getFirstAsync<SessionWithTitleRow>(
        `SELECT sessions.id, sessions.day_id, sessions.started_at, sessions.completed_at, sessions.completed_sets, days.title as dayTitle
         FROM sessions JOIN days ON days.id = sessions.day_id
         WHERE sessions.completed_at IS NOT NULL
         ORDER BY sessions.completed_at DESC LIMIT 1`
      );
      if (!row) return null;
      return { ...mapSession(row), dayTitle: row.dayTitle };
    },

    async listCompleted(limit) {
      const rows = await db.getAllAsync<SessionWithTitleRow>(
        `SELECT sessions.id, sessions.day_id, sessions.started_at, sessions.completed_at, sessions.completed_sets, days.title as dayTitle
         FROM sessions JOIN days ON days.id = sessions.day_id
         WHERE sessions.completed_at IS NOT NULL
         ORDER BY sessions.completed_at DESC LIMIT ?`,
        limit
      );
      return rows.map((row) => ({ ...mapSession(row), dayTitle: row.dayTitle }));
    },
  };
}
