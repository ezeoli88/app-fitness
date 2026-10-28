import { z } from 'zod';

export const routineDraft = z.object({
  id: z.string().nullable(),
  title: z.string(),
  level: z.string(),
  sort: z.number().int(),
  days: z.array(z.object({
    id: z.number().int().nullable(),
    title: z.string(),
    sort: z.number().int(),
    exercises: z.array(z.object({
      id: z.number().int().nullable(),
      name: z.string(),
      sets: z.number().int(),
      reps: z.number().int(),
      sort: z.number().int(),
      targetWeightKg: z.number().finite().nonnegative().nullable().optional(),
    })),
  })),
});

export const setPatch = z.object({
  completed: z.boolean().optional(),
  weightKg: z.number().nullable().optional(),
  actualReps: z.number().int().nullable().optional(),
}).strict();

/** Tope holgado: una sesión real tiene unas decenas de series. */
const MAX_SET_WRITES = 500;

/** Series identificadas igual que en el PATCH de una serie; compartido por el cierre y la escritura en bloque. */
const setWrites = z.array(z.object({
  exerciseId: z.number().int().positive(),
  setIndex: z.number().int().nonnegative(),
  patch: setPatch,
}).strict()).max(MAX_SET_WRITES);

/** `sets` es opcional para que un cliente viejo pueda seguir finalizando sin series. */
export const finishBody = z.object({
  completedAt: z.string().min(1),
  sets: setWrites.optional(),
});

export const bulkSetsBody = z.object({
  sets: setWrites.min(1),
}).strict();

export const exerciseOptionalBody = z.object({
  exerciseId: z.number().int().positive(),
  optional: z.boolean(),
}).strict();

const MAX_HINT_IDS = 100;

/** Lee `ids=1,2,3`; devuelve null si alguno no es un entero positivo. */
export function parseExerciseIds(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length > MAX_HINT_IDS) return null;
  const ids = parts.map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? ids : null;
}
