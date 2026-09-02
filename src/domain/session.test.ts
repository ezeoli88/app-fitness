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
} from './session';

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
