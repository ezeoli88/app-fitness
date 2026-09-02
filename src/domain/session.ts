export function emptyMarks(setCount: number): boolean[] {
  return Array.from({ length: setCount }, () => false);
}

export function toggleSet(marks: boolean[], setIndex: number): boolean[] {
  if (setIndex < 0 || setIndex >= marks.length) return marks;
  const next = marks.slice();
  next[setIndex] = !next[setIndex];
  return next;
}

export function isExerciseComplete(marks: boolean[]): boolean {
  return marks.length > 0 && marks.every(Boolean);
}

export function ensureExerciseMarks(
  completedSets: Record<number, boolean[]>,
  exerciseId: number,
  setCount: number
): boolean[] {
  const existing = completedSets[exerciseId];
  if (existing && existing.length === setCount) return existing;
  if (!existing) return emptyMarks(setCount);
  const next = emptyMarks(setCount);
  for (let i = 0; i < Math.min(existing.length, setCount); i++) {
    next[i] = existing[i];
  }
  return next;
}

export function applyToggle(args: {
  completedSets: Record<number, boolean[]>;
  exerciseId: number;
  setIndex: number;
  setCount: number;
}): Record<number, boolean[]> {
  const marks = ensureExerciseMarks(args.completedSets, args.exerciseId, args.setCount);
  return {
    ...args.completedSets,
    [args.exerciseId]: toggleSet(marks, args.setIndex),
  };
}

export function isDayComplete(
  exercises: { id: number; sets: number }[],
  completedSets: Record<number, boolean[]>
): boolean {
  if (exercises.length === 0) return false;
  return exercises.every((exercise) =>
    isExerciseComplete(ensureExerciseMarks(completedSets, exercise.id, exercise.sets))
  );
}

export function countCompletedSets(completedSets: Record<number, boolean[]>): number {
  return Object.values(completedSets).reduce(
    (sum, marks) => sum + marks.filter(Boolean).length,
    0
  );
}

export function totalSets(exercises: { sets: number }[]): number {
  return exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
}

export function countCompletedExercises(
  exercises: { id: number; sets: number }[],
  completedSets: Record<number, boolean[]>
): number {
  return exercises.filter((exercise) =>
    isExerciseComplete(ensureExerciseMarks(completedSets, exercise.id, exercise.sets))
  ).length;
}

export function findClosingToggle(args: {
  exercises: { id: number; sets: number }[];
  before: Record<number, boolean[]>;
  after: Record<number, boolean[]>;
}): { exerciseId: number; setIndex: number } | null {
  if (isDayComplete(args.exercises, args.before)) return null;
  if (!isDayComplete(args.exercises, args.after)) return null;

  for (const exercise of args.exercises) {
    const beforeMarks = ensureExerciseMarks(args.before, exercise.id, exercise.sets);
    const afterMarks = ensureExerciseMarks(args.after, exercise.id, exercise.sets);
    for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
      if (!beforeMarks[setIndex] && afterMarks[setIndex]) {
        return { exerciseId: exercise.id, setIndex };
      }
    }
  }
  return null;
}
