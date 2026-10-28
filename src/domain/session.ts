import { formatOptionalReps, formatOptionalWeight, parseRepsInput, parseWeightInput } from '@/domain/series';
import type { SessionDetails, SessionExercise, SessionSet, SessionSetWrite } from '@/domain/types';

export type SetDraft = { weight: string; reps: string };

/**
 * Todas las series de la sesión con su marca, peso y repeticiones, para guardarlas junto con el cierre.
 * Lanza el error de validación si algún borrador no es un número válido.
 */
export function finishSetWrites(
  session: SessionDetails,
  draftFor: (exerciseId: number, setIndex: number) => SetDraft | undefined
): SessionSetWrite[] {
  return session.exercises.flatMap((exercise) => exercise.series.map((series) => {
    const draft = draftFor(exercise.sourceExerciseId, series.setIndex) ?? {
      weight: formatOptionalWeight(series.weightKg),
      reps: formatOptionalReps(series.actualReps),
    };
    return {
      exerciseId: exercise.sourceExerciseId,
      setIndex: series.setIndex,
      patch: {
        completed: series.completed,
        weightKg: parseWeightInput(draft.weight),
        actualReps: parseRepsInput(draft.reps),
      },
    };
  }));
}

/**
 * Regla de "serie con datos cargados" para valores guardados, sin saber si los tocó el usuario en esta pantalla:
 * tiene peso (0 incluido), o repeticiones distintas del objetivo del ejercicio.
 * Unas repeticiones iguales al objetivo sin peso no cuentan, porque pueden ser un valor por defecto que nadie cargó.
 * `discardEmptySession` (src/db/gymDb.ts) aplica la misma regla en SQL; si cambia una, cambiar la otra.
 */
export function hasEnteredValues(set: { weightKg: number | null; actualReps: number | null }, targetReps: number): boolean {
  return set.weightKg !== null || (set.actualReps !== null && set.actualReps !== targetReps);
}

export type SetKey = { exerciseId: number; setIndex: number };

/**
 * Series sin marcar que tienen datos cargados.
 * Por campo: si el usuario lo escribió o copió desde esta pantalla (`touched`), cuenta cualquier texto no vacío
 * del borrador; si no, se mira solo lo guardado con la regla de `hasEnteredValues` (así el peso precargado,
 * que vive únicamente en el borrador, no cuenta). No valida los números: eso lo hace `finishSetWrites`.
 */
export function setsWithEnteredValues(
  session: SessionDetails,
  draftFor: (exerciseId: number, setIndex: number) => SetDraft | undefined,
  touched: (exerciseId: number, setIndex: number, field: keyof SetDraft) => boolean
): SetKey[] {
  return session.exercises.flatMap((exercise) => exercise.series.flatMap((series) => {
    if (series.completed) return [];
    const exerciseId = exercise.sourceExerciseId;
    const draft = draftFor(exerciseId, series.setIndex) ?? { weight: '', reps: '' };
    const weight = touched(exerciseId, series.setIndex, 'weight')
      ? draft.weight.trim() !== ''
      : hasEnteredValues({ weightKg: series.weightKg, actualReps: null }, exercise.reps);
    const reps = touched(exerciseId, series.setIndex, 'reps')
      ? draft.reps.trim() !== ''
      : hasEnteredValues({ weightKg: null, actualReps: series.actualReps }, exercise.reps);
    return weight || reps ? [{ exerciseId, setIndex: series.setIndex }] : [];
  }));
}

/** Las escrituras de cierre con `completed: true` en las series indicadas; el resto queda igual. */
export function markSetWrites(sets: SessionSetWrite[], marks: SetKey[]): SessionSetWrite[] {
  const keys = new Set(marks.map((mark) => `${mark.exerciseId}:${mark.setIndex}`));
  return sets.map((set) => keys.has(`${set.exerciseId}:${set.setIndex}`)
    ? { ...set, patch: { ...set.patch, completed: true } }
    : set);
}

/** La sesión en memoria con las series indicadas marcadas, como queda después de `markSetWrites`. */
export function markSessionSets(session: SessionDetails, marks: SetKey[]): SessionDetails {
  if (marks.length === 0) return session;
  const keys = new Set(marks.map((mark) => `${mark.exerciseId}:${mark.setIndex}`));
  const completedSets = { ...session.completedSets };
  const exercises = session.exercises.map((exercise) => {
    const exerciseId = exercise.sourceExerciseId;
    if (!marks.some((mark) => mark.exerciseId === exerciseId)) return exercise;
    const series = exercise.series.map((set) => keys.has(`${exerciseId}:${set.setIndex}`) ? { ...set, completed: true } : set);
    completedSets[exerciseId] = ensureExerciseMarks(session.completedSets, exerciseId, series.length)
      .map((done, index) => done || keys.has(`${exerciseId}:${index}`));
    return { ...exercise, series };
  });
  return { ...session, completedSets, exercises };
}

/**
 * Series realizadas y series que hacen falta para completar la sesión. Un ejercicio opcional solo suma
 * las series que se hicieron, así que no deja la sesión parcial: `done === total` es una sesión completa.
 * `finishSession` (src/db/gymDb.ts) aplica la misma regla en SQL; si cambia una, cambiar la otra.
 */
export function sessionSetProgress(
  exercises: { optional: boolean; series: { completed: boolean }[] }[]
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const exercise of exercises) {
    const completed = exercise.series.filter((set) => set.completed).length;
    done += completed;
    total += exercise.optional ? completed : exercise.series.length;
  }
  return { done, total };
}

export type EmptyFinishChoice ={ kind: 'finish' } | { kind: 'mark'; sets: SetKey[] } | { kind: 'discard' };

/**
 * Qué ofrecer al finalizar: cerrar si hay series realizadas; si no, marcar las que tienen datos y cerrar;
 * y descartar solo si la sesión está realmente vacía.
 */
export function emptyFinishChoice(completedCount: number, entered: SetKey[]): EmptyFinishChoice {
  if (completedCount > 0) return { kind: 'finish' };
  return entered.length > 0 ? { kind: 'mark', sets: entered } : { kind: 'discard' };
}

/**
 * Peso y repeticiones de la sesión anterior, posición por posición, para las series del ejercicio.
 * No toca la marca de realizada.
 */
export function copyPreviousWrites(
  exercise: SessionExercise & { series: SessionSet[] },
  previous: SessionSet[]
): SessionSetWrite[] {
  return exercise.series.flatMap((series) => {
    const prior = previous[series.setIndex];
    if (!prior) return [];
    return [{
      exerciseId: exercise.sourceExerciseId,
      setIndex: series.setIndex,
      patch: { weightKg: prior.weightKg, actualReps: prior.actualReps },
    }];
  });
}

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
