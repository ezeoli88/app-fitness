export function parseWeightInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(trimmed)) {
    throw new Error('Ingresá un peso igual o mayor a cero.');
  }
  const weight = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(weight)) throw new Error('Ingresá un peso igual o mayor a cero.');
  return weight;
}

export function parseRepsInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1 || !Number.isSafeInteger(Number(trimmed))) {
    throw new Error('Las repeticiones deben ser un entero positivo.');
  }
  return Number(trimmed);
}

export function formatOptionalWeight(weight: number | null): string {
  return weight === null ? '' : `${weight}`;
}

export function formatOptionalReps(reps: number | null): string {
  return reps === null ? '' : `${reps}`;
}
