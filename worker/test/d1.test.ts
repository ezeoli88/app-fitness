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
      "INSERT INTO days (routine_id, title, sort) VALUES ('c', 'Día', 0)"
    ).run();
    const day = await env.DB.prepare("SELECT id FROM days WHERE routine_id = 'c'").first<{ id: number }>();
    await expect(env.DB.prepare(
      'INSERT INTO exercises (day_id, name, sets, reps, sort) VALUES (?, ?, 0, 8, 0)'
    ).bind(day?.id, 'X').run()).rejects.toThrow();
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tombstones', 'sync_meta')"
    ).all<{ name: string }>();
    expect(tables.results).toEqual([]);
    await expect(env.DB.prepare(
      'INSERT INTO exercises (day_id, name, sets, reps, sort, target_weight_kg) VALUES (?, ?, 3, 8, 0, -1)'
    ).bind(day?.id, 'X').run()).rejects.toThrow();
    await env.DB.prepare(
      'INSERT INTO exercises (day_id, name, sets, reps, sort) VALUES (?, ?, 3, 8, 0)'
    ).bind(day?.id, 'Y').run();
    const plain = await env.DB.prepare("SELECT target_weight_kg FROM exercises WHERE name = 'Y'").first();
    expect(plain).toEqual({ target_weight_kg: null });
  });
});
