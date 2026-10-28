import { applySetAutofill, type SetAutofill, type SetFieldDraft } from './setAutocomplete';

function sets(rows: [string, string][]): SetFieldDraft[] {
  return rows.map(([weight, reps], setIndex) => ({ setIndex, weight, reps }));
}

const exerciseId = 10;

test('fills following blank reps and leaves weight, earlier sets and typed reps alone', () => {
  const input = sets([['25', ''], ['25', ''], ['25', '8'], ['', '']]);
  const applied = applySetAutofill({
    exerciseId,
    sets: input,
    setIndex: 0,
    field: 'reps',
    value: '12',
    previous: null,
  });

  expect(applied.targets).toEqual([1, 3]);
  expect(applied.sets.map((set) => set.reps)).toEqual(['12', '12', '8', '12']);
  expect(applied.sets.map((set) => set.weight)).toEqual(['25', '25', '25', '']);
  expect(applied.next).toEqual({ exerciseId, setIndex: 0, field: 'reps', value: '12', linked: [1, 3] });
  expect(input.map((set) => set.reps)).toEqual(['', '', '8', '']);
});

test('keeps a stored zero and any weight already present', () => {
  const applied = applySetAutofill({
    exerciseId,
    sets: sets([['', ''], ['0', ''], ['20', ''], ['   ', '5']]),
    setIndex: 0,
    field: 'weight',
    value: '40',
    previous: null,
  });

  expect(applied.targets).toEqual([3]);
  expect(applied.sets.map((set) => set.weight)).toEqual(['40', '0', '20', '40']);
  expect(applied.sets.map((set) => set.reps)).toEqual(['', '', '', '5']);
});

test('updates sets filled while typing and keeps a manual correction', () => {
  const first = applySetAutofill({
    exerciseId,
    sets: sets([['', ''], ['', ''], ['', ''], ['', '']]),
    setIndex: 0,
    field: 'weight',
    value: '6',
    previous: null,
  });
  const corrected = first.sets.map((set, index) => index === 2 ? { ...set, weight: '55' } : set);
  const second = applySetAutofill({
    exerciseId,
    sets: corrected,
    setIndex: 0,
    field: 'weight',
    value: '60',
    previous: first.next,
  });

  expect(second.targets).toEqual([1, 3]);
  expect(second.sets.map((set) => set.weight)).toEqual(['60', '60', '55', '60']);
});

test('after the entry is committed, a new value does not rewrite filled sets', () => {
  const typed = applySetAutofill({
    exerciseId,
    sets: sets([['', ''], ['', ''], ['', ''], ['', '']]),
    setIndex: 0,
    field: 'weight',
    value: '60',
    previous: null,
  });
  const again = applySetAutofill({
    exerciseId,
    sets: typed.sets,
    setIndex: 0,
    field: 'weight',
    value: '70',
    previous: null,
  });

  expect(again.targets).toEqual([]);
  expect(again.sets.map((set) => set.weight)).toEqual(['70', '60', '60', '60']);
});

test('editing a later set keeps earlier values and only fills blanks after it', () => {
  const typed = applySetAutofill({
    exerciseId,
    sets: sets([['', ''], ['', ''], ['', ''], ['', '']]),
    setIndex: 0,
    field: 'weight',
    value: '60',
    previous: null,
  });
  const edited = applySetAutofill({
    exerciseId,
    sets: typed.sets,
    setIndex: 1,
    field: 'weight',
    value: '55',
    previous: typed.next,
  });

  expect(edited.targets).toEqual([]);
  expect(edited.sets.map((set) => set.weight)).toEqual(['60', '55', '60', '60']);
});

test('clearing the field while typing clears only the sets that entry filled', () => {
  const typed = applySetAutofill({
    exerciseId,
    sets: sets([['', ''], ['', ''], ['', ''], ['50', '']]),
    setIndex: 0,
    field: 'weight',
    value: '60',
    previous: null,
  });
  const cleared = applySetAutofill({
    exerciseId,
    sets: typed.sets,
    setIndex: 0,
    field: 'weight',
    value: '',
    previous: typed.next,
  });

  expect(cleared.targets).toEqual([1, 2]);
  expect(cleared.sets.map((set) => set.weight)).toEqual(['', '', '', '50']);
});

test('a blank value does not seed other empty sets', () => {
  const applied = applySetAutofill({
    exerciseId,
    sets: sets([['20', ''], ['', ''], ['', '']]),
    setIndex: 0,
    field: 'reps',
    value: '   ',
    previous: null,
  });

  expect(applied.targets).toEqual([]);
  expect(applied.next).toBeNull();
  expect(applied.sets.map((set) => set.reps)).toEqual(['', '', '']);
  expect(applied.sets.map((set) => set.weight)).toEqual(['20', '', '']);
});

test('ignores a link from another exercise or from the other field', () => {
  const otherExercise: SetAutofill = { exerciseId: 99, setIndex: 0, field: 'weight', value: '6', linked: [1, 2] };
  const otherField: SetAutofill = { exerciseId, setIndex: 0, field: 'reps', value: '6', linked: [1, 2] };
  const rows = sets([['6', '6'], ['6', '6'], ['6', '6']]);

  const fromExercise = applySetAutofill({
    exerciseId,
    sets: rows,
    setIndex: 0,
    field: 'weight',
    value: '70',
    previous: otherExercise,
  });
  const fromField = applySetAutofill({
    exerciseId,
    sets: rows,
    setIndex: 0,
    field: 'weight',
    value: '70',
    previous: otherField,
  });

  expect(fromExercise.targets).toEqual([]);
  expect(fromField.targets).toEqual([]);
  expect(fromExercise.sets.map((set) => set.weight)).toEqual(['70', '6', '6']);
  expect(fromExercise.sets.map((set) => set.reps)).toEqual(['6', '6', '6']);
});

test('fills only sets after the one being edited, in set order', () => {
  const applied = applySetAutofill({
    exerciseId,
    sets: [
      { setIndex: 3, weight: '', reps: '' },
      { setIndex: 1, weight: '', reps: '4' },
      { setIndex: 0, weight: '10', reps: '' },
      { setIndex: 2, weight: '', reps: '' },
    ],
    setIndex: 1,
    field: 'reps',
    value: '8',
    previous: null,
  });

  expect(applied.targets).toEqual([2, 3]);
  expect(applied.sets.map((set) => [set.setIndex, set.reps])).toEqual([[3, '8'], [1, '8'], [0, ''], [2, '8']]);
});

test('an unknown set changes nothing', () => {
  const input = sets([['', ''], ['', '']]);
  const applied = applySetAutofill({
    exerciseId,
    sets: input,
    setIndex: 5,
    field: 'weight',
    value: '10',
    previous: null,
  });

  expect(applied.targets).toEqual([]);
  expect(applied.next).toBeNull();
  expect(applied.sets).toEqual(input);
  expect(applied.sets).not.toBe(input);
});
