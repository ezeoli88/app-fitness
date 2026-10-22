import {
  emptyMarks,
  toggleSet,
  isExerciseComplete,
  applyToggle,
  isDayComplete,
  countCompletedSets,
  totalSets,
  countCompletedExercises,
  findClosingToggle,
  finishSetWrites,
} from './session';
import type { SessionDetails } from './types';

const pecs = [
  { id: 10, sets: 4 },
  { id: 11, sets: 4 },
];

test('emptyMarks is all false with the right length', () => {
  expect(emptyMarks(4)).toEqual([false, false, false, false]);
});

test('toggleSet flips one index and does not mutate', () => {
  const marks = emptyMarks(4);
  const next = toggleSet(marks, 2);
  expect(next).toEqual([false, false, true, false]);
  expect(marks).toEqual([false, false, false, false]);
});

test('toggleSet ignores out of range', () => {
  const marks = emptyMarks(2);
  expect(toggleSet(marks, 9)).toBe(marks);
  expect(toggleSet(marks, -1)).toBe(marks);
});

test('exercise completes only when every set is true', () => {
  expect(isExerciseComplete([true, true, true, false])).toBe(false);
  expect(isExerciseComplete([true, true, true, true])).toBe(true);
  expect(isExerciseComplete([])).toBe(false);
});

test('applyToggle can mark sets out of order', () => {
  let sets = {};
  sets = applyToggle({ completedSets: sets, exerciseId: 10, setIndex: 3, setCount: 4 });
  sets = applyToggle({ completedSets: sets, exerciseId: 10, setIndex: 0, setCount: 4 });
  expect(sets[10]).toEqual([true, false, false, true]);
});

test('day is not complete until every exercise is complete', () => {
  const half = { 10: [true, true, true, true], 11: [true, true, false, false] };
  expect(isDayComplete(pecs, half)).toBe(false);
  const done = { 10: [true, true, true, true], 11: [true, true, true, true] };
  expect(isDayComplete(pecs, done)).toBe(true);
});

test('missing exercise marks means day is not complete', () => {
  expect(isDayComplete(pecs, { 10: [true, true, true, true] })).toBe(false);
});

test('counts series and exercises', () => {
  const sets = { 10: [true, true, false, false], 11: [true, true, true, true] };
  expect(totalSets(pecs)).toBe(8);
  expect(countCompletedSets(sets)).toBe(6);
  expect(countCompletedExercises(pecs, sets)).toBe(1);
});

test('findClosingToggle returns the set that closed the day', () => {
  const before = { 10: [true, true, true, true], 11: [true, true, true, false] };
  const after = applyToggle({
    completedSets: before,
    exerciseId: 11,
    setIndex: 3,
    setCount: 4,
  });
  expect(findClosingToggle({ exercises: pecs, before, after })).toEqual({
    exerciseId: 11,
    setIndex: 3,
  });
});

test('findClosingToggle is null when the day is still open', () => {
  const before = { 10: emptyMarks(4), 11: emptyMarks(4) };
  const after = applyToggle({
    completedSets: before,
    exerciseId: 10,
    setIndex: 0,
    setCount: 4,
  });
  expect(findClosingToggle({ exercises: pecs, before, after })).toBeNull();
});

function sevenByFour(): SessionDetails {
  return {
    id: 1, dayId: 1, startedAt: '2026-10-22T09:00:00.000Z', completedAt: null, completedSets: {},
    status: 'open', routineId: 'r', routineTitle: 'R', dayTitle: 'D',
    exercises: Array.from({ length: 7 }, (_, exerciseIndex) => ({
      id: 100 + exerciseIndex, sessionId: 1, sourceExerciseId: 10 + exerciseIndex,
      name: `E${exerciseIndex}`, sets: 4, reps: 8, sort: exerciseIndex,
      series: Array.from({ length: 4 }, (_, setIndex) => ({
        id: exerciseIndex * 4 + setIndex + 1, sessionExerciseId: 100 + exerciseIndex, setIndex,
        completed: setIndex < 2, weightKg: 40, actualReps: null,
      })),
    })),
  };
}

test('finishSetWrites sends every set with its mark and parsed drafts', () => {
  const sets = finishSetWrites(sevenByFour(), (exerciseId, setIndex) =>
    exerciseId === 10 && setIndex === 1 ? { weight: '42,5', reps: '6' } : undefined);
  expect(sets).toHaveLength(28);
  expect(sets[0]).toEqual({ exerciseId: 10, setIndex: 0, patch: { completed: true, weightKg: 40, actualReps: null } });
  expect(sets[1]).toEqual({ exerciseId: 10, setIndex: 1, patch: { completed: true, weightKg: 42.5, actualReps: 6 } });
  expect(sets[27]).toEqual({ exerciseId: 16, setIndex: 3, patch: { completed: false, weightKg: 40, actualReps: null } });
});

test('finishSetWrites rejects an invalid draft before sending anything', () => {
  expect(() => finishSetWrites(sevenByFour(), () => ({ weight: '12,', reps: '' }))).toThrow();
});
