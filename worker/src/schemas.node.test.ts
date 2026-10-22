import { describe, expect, it } from 'vitest';

import { finishBody, parseExerciseIds, routineDraft } from './schemas';

function draft(exercise: Record<string, unknown>) {
  return {
    id: null,
    title: 'Fuerza',
    level: 'x',
    sort: 0,
    days: [{ id: null, title: 'Día A', sort: 0, exercises: [{ id: null, name: 'Press', sets: 3, reps: 8, sort: 0, ...exercise }] }],
  };
}

describe('routineDraft', () => {
  it('acepta el peso objetivo ausente, nulo, cero o decimal', () => {
    expect(routineDraft.safeParse(draft({})).success).toBe(true);
    expect(routineDraft.safeParse(draft({ targetWeightKg: null })).success).toBe(true);
    expect(routineDraft.safeParse(draft({ targetWeightKg: 0 })).success).toBe(true);
    const parsed = routineDraft.parse(draft({ targetWeightKg: 42.5 }));
    expect(parsed.days[0].exercises[0].targetWeightKg).toBe(42.5);
  });

  it('rechaza un peso objetivo negativo o que no es número', () => {
    expect(routineDraft.safeParse(draft({ targetWeightKg: -1 })).success).toBe(false);
    expect(routineDraft.safeParse(draft({ targetWeightKg: '40' })).success).toBe(false);
    expect(routineDraft.safeParse(draft({ targetWeightKg: Number.POSITIVE_INFINITY })).success).toBe(false);
  });
});

describe('finishBody', () => {
  const completedAt = '2026-10-22T10:00:00.000Z';
  const set = (patch: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ exerciseId: 3, setIndex: 0, patch, ...extra });

  it('acepta el cierre sin series y con series completas o parciales', () => {
    expect(finishBody.safeParse({ completedAt }).success).toBe(true);
    expect(finishBody.safeParse({ completedAt, sets: [] }).success).toBe(true);
    expect(finishBody.safeParse({ completedAt, sets: [set({ completed: true, weightKg: 42.5, actualReps: 8 }), set({ weightKg: null })] }).success).toBe(true);
  });

  it('rechaza series mal formadas o demasiadas', () => {
    expect(finishBody.safeParse({ completedAt: '' }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: {} }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: [set({ completed: 1 })] }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: [set({ actualReps: 2.5 })] }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: [set({ other: true })] }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: [set({}, { setIndex: -1 })] }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: [set({}, { sessionId: 9 })] }).success).toBe(false);
    expect(finishBody.safeParse({ completedAt, sets: Array.from({ length: 501 }, () => set({ completed: true })) }).success).toBe(false);
  });
});

describe('parseExerciseIds', () => {
  it('lee una lista de enteros positivos y rechaza el resto', () => {
    expect(parseExerciseIds('1,2,30')).toEqual([1, 2, 30]);
    expect(parseExerciseIds(undefined)).toBeNull();
    expect(parseExerciseIds('')).toBeNull();
    expect(parseExerciseIds('1,x')).toBeNull();
    expect(parseExerciseIds('0')).toBeNull();
    expect(parseExerciseIds('1,,2')).toBeNull();
    expect(parseExerciseIds(Array.from({ length: 101 }, (_, i) => i + 1).join(','))).toBeNull();
  });
});
