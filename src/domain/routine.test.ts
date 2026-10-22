import type { RoutineDraft } from './types';
import { nextTrainingDay, pickActiveRoutine, validateRoutineDraft } from './routine';

function draftWithTarget(targetWeightKg: number | null | undefined): RoutineDraft {
  return {
    id: null,
    title: 'Fuerza',
    level: 'x',
    sort: 0,
    days: [{ id: null, title: 'Día A', sort: 0, exercises: [{ id: null, name: 'Press', sets: 3, reps: 8, sort: 0, targetWeightKg }] }],
  };
}

test('target weight is optional and must be a non-negative number', () => {
  expect(validateRoutineDraft(draftWithTarget(undefined))).toBeNull();
  expect(validateRoutineDraft(draftWithTarget(null))).toBeNull();
  expect(validateRoutineDraft(draftWithTarget(0))).toBeNull();
  expect(validateRoutineDraft(draftWithTarget(42.5))).toBeNull();
  expect(validateRoutineDraft(draftWithTarget(-1))).toContain('peso objetivo');
  expect(validateRoutineDraft(draftWithTarget(Number.NaN))).toContain('peso objetivo');
});

const catalog = [
  { id: 'principiantes', title: 'Principiantes', level: 'principiante', sort: 0 },
  { id: 'intermedio', title: 'Intermedio', level: 'intermedio', sort: 1 },
];

test('next day follows the current order, wraps, and recovers from a deleted day', () => {
  const days = [3, 1, 2].map((id, sort) => ({ id, sort, routineId: 'r', title: String(id) }));
  expect(nextTrainingDay(days, null)?.id).toBe(3);
  expect(nextTrainingDay(days, 3)?.id).toBe(1);
  expect(nextTrainingDay(days, 2)?.id).toBe(3);
  expect(nextTrainingDay(days, 99)?.id).toBe(3);
  expect(nextTrainingDay([], 1)).toBeNull();
});

test('archived routines are excluded from active selection', () => {
  expect(pickActiveRoutine([{ ...catalog[0], archivedAt: '2026-01-01' }, catalog[1]], 'principiantes')?.id).toBe('intermedio');
  expect(pickActiveRoutine([{ ...catalog[0], archivedAt: '2026-01-01' }], null)).toBeNull();
});

test('pickActiveRoutine returns the matching id', () => {
  expect(pickActiveRoutine(catalog, 'intermedio')?.id).toBe('intermedio');
});

test('pickActiveRoutine falls back to principiantes then first', () => {
  expect(pickActiveRoutine(catalog, null)?.id).toBe('principiantes');
  expect(pickActiveRoutine(catalog, 'no-existe')?.id).toBe('principiantes');
  expect(pickActiveRoutine([{ id: 'otra', title: 'Otra', level: 'avanzado', sort: 0 }], null)?.id).toBe(
    'otra'
  );
});
