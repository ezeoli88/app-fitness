import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { registerRepositoryContract } from '@/db/repository.contract';
import { createD1Driver } from '../src/d1Driver';

async function reset(): Promise<void> {
  await env.DB.exec(`
    PRAGMA foreign_keys = ON;
    DELETE FROM sessions;
    DELETE FROM exercises;
    DELETE FROM days;
    DELETE FROM routines;
    DELETE FROM settings;
    DELETE FROM tombstones;
  `);
}

registerRepositoryContract((name, run) => {
  it(name, run);
}, async () => {
  await reset();
  return { driver: createD1Driver(env.DB), close: async () => undefined };
});

describe('migraciones D1', () => {
  it('deja el índice de una sesión abierta y los checks', async () => {
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ux_sessions_one_open_per_day'"
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toContain('ux_sessions_one_open_per_day');
    await expect(env.DB.prepare(
      "INSERT INTO routines (id, title, level, sort) VALUES ('c', 'C', 'x', 0)"
    ).run()).resolves.toBeTruthy();
    await env.DB.prepare(
      "INSERT INTO days (uid, routine_id, title, sort) VALUES ('c:d0', 'c', 'Día', 0)"
    ).run();
    const day = await env.DB.prepare("SELECT id FROM days WHERE uid = 'c:d0'").first<{ id: number }>();
    await expect(env.DB.prepare(
      `INSERT INTO exercises (uid, day_id, name, sets, reps, sort) VALUES ('bad', ?, 'X', 0, 8, 0)`
    ).bind(day?.id).run()).rejects.toThrow();
  });

  it('incrementa rev una sola vez y guarda tombstones', async () => {
    await env.DB.prepare(
      "INSERT INTO routines (id, title, level, sort) VALUES ('rev', 'Rev', 'x', 0)"
    ).run();
    const inserted = await env.DB.prepare("SELECT rev FROM routines WHERE id = 'rev'").first<{ rev: number }>();
    expect(inserted?.rev).toBe(1);
    await env.DB.prepare("UPDATE routines SET title = 'Rev 2' WHERE id = 'rev'").run();
    const updated = await env.DB.prepare("SELECT rev FROM routines WHERE id = 'rev'").first<{ rev: number }>();
    expect(updated?.rev).toBe(2);

    await env.DB.prepare(
      "INSERT INTO days (uid, routine_id, title, sort) VALUES ('rev:d0', 'rev', 'Día', 0)"
    ).run();
    const day = await env.DB.prepare("SELECT id FROM days WHERE uid = 'rev:d0'").first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO sessions (uid, day_id, started_at, completed_sets, status, routine_id, routine_title, day_title)
       VALUES ('session-1', ?, '2026-01-01T00:00:00.000Z', '{}', 'completed', 'rev', 'Rev', 'Día')`
    ).bind(day?.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE uid = 'session-1'").run();
    const tombstone = await env.DB.prepare(
      "SELECT table_name FROM tombstones WHERE uid = 'session-1'"
    ).first<{ table_name: string }>();
    expect(tombstone?.table_name).toBe('sessions');
  });
});
