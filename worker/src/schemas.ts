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

const MAX_HINT_IDS = 100;

/** Lee `ids=1,2,3`; devuelve null si alguno no es un entero positivo. */
export function parseExerciseIds(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length > MAX_HINT_IDS) return null;
  const ids = parts.map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? ids : null;
}
