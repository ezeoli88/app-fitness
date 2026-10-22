import { prefillWeight, weightPrefills } from '@/domain/prefill';
import type { SessionDetails, SessionSet } from '@/domain/types';

function set(setIndex: number, overrides: Partial<SessionSet> = {}): SessionSet {
  return { id: setIndex + 1, sessionExerciseId: 1, setIndex, completed: false, weightKg: null, actualReps: null, ...overrides };
}

function session(overrides: Partial<SessionDetails> = {}): SessionDetails {
  return {
    id: 1,
    dayId: 1,
    startedAt: '2026-10-22T10:00:00.000Z',
    completedAt: null,
    completedSets: {},
    status: 'open',
    routineId: 'r',
    routineTitle: 'Rutina',
    dayTitle: 'Día A',
    exercises: [
      { id: 1, sessionId: 1, sourceExerciseId: 10, name: 'Sentadilla', sets: 3, reps: 8, sort: 0, series: [set(0), set(1), set(2)] },
      { id: 2, sessionId: 1, sourceExerciseId: 20, name: 'Press', sets: 2, reps: 8, sort: 1, series: [set(0), set(1)] },
    ],
    ...overrides,
  };
}

describe('prefillWeight', () => {
  it('prefers the last used weight, falls back to the target and keeps zero', () => {
    expect(prefillWeight({ lastWeightKg: 60, targetWeightKg: 70 })).toBe(60);
    expect(prefillWeight({ lastWeightKg: null, targetWeightKg: 70 })).toBe(70);
    expect(prefillWeight({ lastWeightKg: 0, targetWeightKg: 70 })).toBe(0);
    expect(prefillWeight({ lastWeightKg: null, targetWeightKg: null })).toBeNull();
    expect(prefillWeight(undefined)).toBeNull();
  });
});

describe('weightPrefills', () => {
  it('fills every empty set of each exercise from its own hint', () => {
    const result = weightPrefills(session(), {
      10: { lastWeightKg: 62.5, targetWeightKg: 70 },
      20: { lastWeightKg: null, targetWeightKg: 40 },
    });
    expect(result).toEqual([
      { exerciseId: 10, setIndex: 0, weightKg: 62.5 },
      { exerciseId: 10, setIndex: 1, weightKg: 62.5 },
      { exerciseId: 10, setIndex: 2, weightKg: 62.5 },
      { exerciseId: 20, setIndex: 0, weightKg: 40 },
      { exerciseId: 20, setIndex: 1, weightKg: 40 },
    ]);
  });

  it('leaves recorded or completed sets, exercises without hints and closed sessions alone', () => {
    const current = session();
    current.exercises[0].series[0] = set(0, { weightKg: 55 });
    current.exercises[0].series[1] = set(1, { completed: true });
    expect(weightPrefills(current, { 10: { lastWeightKg: 60, targetWeightKg: null } })).toEqual([
      { exerciseId: 10, setIndex: 2, weightKg: 60 },
    ]);
    expect(weightPrefills(session({ status: 'completed' }), { 10: { lastWeightKg: 60, targetWeightKg: null } })).toEqual([]);
  });
});
