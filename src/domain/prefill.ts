import type { SessionDetails, WeightHint } from '@/domain/types';

export type WeightPrefill = { exerciseId: number; setIndex: number; weightKg: number };

/** El último peso usado manda; si no hay, el peso objetivo. */
export function prefillWeight(hint: WeightHint | undefined): number | null {
  return hint?.lastWeightKg ?? hint?.targetWeightKg ?? null;
}

/** Series abiertas sin peso que conviene precargar. Las ya marcadas o con peso no se tocan. */
export function weightPrefills(session: SessionDetails, hints: Record<number, WeightHint>): WeightPrefill[] {
  if (session.status !== 'open') return [];
  const out: WeightPrefill[] = [];
  for (const exercise of session.exercises) {
    const weightKg = prefillWeight(hints[exercise.sourceExerciseId]);
    if (weightKg === null) continue;
    for (const series of exercise.series) {
      if (series.completed || series.weightKg !== null) continue;
      out.push({ exerciseId: exercise.sourceExerciseId, setIndex: series.setIndex, weightKg });
    }
  }
  return out;
}
