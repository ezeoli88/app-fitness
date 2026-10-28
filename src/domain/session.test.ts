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
  copyPreviousWrites,
  emptyFinishChoice,
  hasEnteredValues,
  markSessionSets,
  markSetWrites,
  sessionSetProgress,
  setsWithEnteredValues,
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
      name: `E${exerciseIndex}`, sets: 4, reps: 8, sort: exerciseIndex, optional: false,
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

test('copyPreviousWrites copies weight and reps by position without touching the mark', () => {
  const exercise = sevenByFour().exercises[0];
  const previous = [
    { id: 90, sessionExerciseId: 9, setIndex: 0, completed: true, weightKg: 50, actualReps: 8 },
    { id: 91, sessionExerciseId: 9, setIndex: 1, completed: false, weightKg: null, actualReps: null },
    { id: 92, sessionExerciseId: 9, setIndex: 2, completed: true, weightKg: 52.5, actualReps: 6 },
  ];
  expect(copyPreviousWrites(exercise, previous)).toEqual([
    { exerciseId: 10, setIndex: 0, patch: { weightKg: 50, actualReps: 8 } },
    { exerciseId: 10, setIndex: 1, patch: { weightKg: null, actualReps: null } },
    { exerciseId: 10, setIndex: 2, patch: { weightKg: 52.5, actualReps: 6 } },
  ]);
  expect(copyPreviousWrites(exercise, [])).toEqual([]);
});

/** Como en producción: nada marcado, sin peso y repeticiones iguales al objetivo (8) en todas las series. */
function untouched(): SessionDetails {
  const session = sevenByFour();
  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      series: exercise.series.map((set) => ({ ...set, completed: false, weightKg: null, actualReps: 8 })),
    })),
  };
}

const noTouch = () => false;

test('hasEnteredValues counts weight (even 0) and reps that differ from the target', () => {
  expect(hasEnteredValues({ weightKg: null, actualReps: null }, 8)).toBe(false);
  expect(hasEnteredValues({ weightKg: null, actualReps: 8 }, 8)).toBe(false);
  expect(hasEnteredValues({ weightKg: null, actualReps: 6 }, 8)).toBe(true);
  expect(hasEnteredValues({ weightKg: 0, actualReps: null }, 8)).toBe(true);
  expect(hasEnteredValues({ weightKg: 40, actualReps: 8 }, 8)).toBe(true);
});

test('setsWithEnteredValues ignores default reps and prefilled weight drafts', () => {
  expect(setsWithEnteredValues(untouched(), () => ({ weight: '40', reps: '8' }), noTouch)).toEqual([]);
});

test('setsWithEnteredValues counts saved values and fields the user typed or copied', () => {
  const session = untouched();
  const patch = (exerciseIndex: number, setIndex: number, values: Partial<SessionDetails['exercises'][number]['series'][number]>) => {
    const series = session.exercises[exerciseIndex].series;
    series[setIndex] = { ...series[setIndex], ...values };
  };
  patch(0, 1, { weightKg: 50 });
  patch(1, 0, { actualReps: 5 });
  // Ya marcada: no se vuelve a ofrecer.
  patch(2, 0, { completed: true, weightKg: 60 });
  // Tenía peso guardado y el usuario lo borró en esta pantalla.
  patch(3, 0, { weightKg: 30 });
  const drafts: Record<string, { weight: string; reps: string }> = {
    '12:3': { weight: '40', reps: '8' },
    '13:0': { weight: '', reps: '8' },
    '13:1': { weight: '40', reps: '' },
  };
  const touched = new Set(['12:3:reps', '13:0:weight', '13:1:reps']);
  expect(setsWithEnteredValues(
    session,
    (exerciseId, setIndex) => drafts[`${exerciseId}:${setIndex}`],
    (exerciseId, setIndex, field) => touched.has(`${exerciseId}:${setIndex}:${field}`),
  )).toEqual([
    { exerciseId: 10, setIndex: 1 },
    { exerciseId: 11, setIndex: 0 },
    // Escribió 8 (igual al objetivo) en esta pantalla: cuenta. 13:1 solo tiene el peso precargado.
    { exerciseId: 12, setIndex: 3 },
  ]);
});

test('emptyFinishChoice offers marking only with data and discarding only when truly empty', () => {
  const sets = [{ exerciseId: 10, setIndex: 0 }];
  expect(emptyFinishChoice(1, sets)).toEqual({ kind: 'finish' });
  expect(emptyFinishChoice(0, sets)).toEqual({ kind: 'mark', sets });
  expect(emptyFinishChoice(0, [])).toEqual({ kind: 'discard' });
});

test('markSetWrites marks only the chosen sets in the finish payload', () => {
  const writes = finishSetWrites(untouched(), () => undefined);
  const marked = markSetWrites(writes, [{ exerciseId: 10, setIndex: 1 }, { exerciseId: 16, setIndex: 3 }]);
  expect(marked).toHaveLength(28);
  expect(marked.filter((set) => set.patch.completed).map(({ exerciseId, setIndex }) => ({ exerciseId, setIndex })))
    .toEqual([{ exerciseId: 10, setIndex: 1 }, { exerciseId: 16, setIndex: 3 }]);
  expect(marked[1].patch).toEqual({ completed: true, weightKg: null, actualReps: 8 });
});

test('markSessionSets updates the series and the per-exercise marks', () => {
  const marked = markSessionSets(untouched(), [{ exerciseId: 10, setIndex: 2 }]);
  expect(marked.completedSets[10]).toEqual([false, false, true, false]);
  expect(marked.exercises[0].series.map((set) => set.completed)).toEqual([false, false, true, false]);
  expect(countCompletedSets(marked.completedSets)).toBe(1);
});

test('sessionSetProgress leaves the missing sets of an optional exercise out of the target', () => {
  const session = sevenByFour();
  // Dos series realizadas de cuatro en cada uno de los siete ejercicios.
  expect(sessionSetProgress(session.exercises)).toEqual({ done: 14, total: 28 });
  const exercises = session.exercises.map((exercise, index) => ({
    ...exercise,
    optional: index === 6,
    series: index === 6 ? exercise.series : exercise.series.map((set) => ({ ...set, completed: true })),
  }));
  expect(sessionSetProgress(exercises)).toEqual({ done: 26, total: 26 });
  exercises[0] = { ...exercises[0], series: exercises[0].series.map((set) => ({ ...set, completed: false })) };
  expect(sessionSetProgress(exercises)).toEqual({ done: 22, total: 26 });
  expect(sessionSetProgress([])).toEqual({ done: 0, total: 0 });
});
