export type SetFieldName = 'weight' | 'reps';

export type SetFieldDraft = {
  setIndex: number;
  weight: string;
  reps: string;
};

/**
 * Series que este ingreso todavía puede actualizar.
 * Se descarta al confirmar el campo, para no pisar después un valor ya dejado.
 */
export type SetAutofill = {
  exerciseId: number;
  setIndex: number;
  field: SetFieldName;
  value: string;
  linked: number[];
};

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

/** El usuario sigue armando el mismo número ("6" → "60", "12" → "12,5", borrar un dígito). */
function sameTyping(previous: string, next: string): boolean {
  if (previous === '' || next === '') return false;
  return next.startsWith(previous) || previous.startsWith(next);
}

function sameEntry(
  previous: SetAutofill | null,
  exerciseId: number,
  setIndex: number,
  field: SetFieldName,
): previous is SetAutofill {
  return previous !== null
    && previous.exerciseId === exerciseId
    && previous.setIndex === setIndex
    && previous.field === field;
}

/**
 * Completa el mismo campo en las series siguientes del ejercicio que estén vacías.
 * Un 0 ya escrito no está vacío y no se pisa. Mientras el usuario sigue armando el
 * mismo número, las series que este ingreso acaba de llenar se actualizan (un "6" pasa
 * a "60"). Reemplazar el número por otro ("40" por "0") no las toca, y una corrección
 * manual deja de coincidir y se conserva. No mira otra sesión ni el otro campo.
 */
export function applySetAutofill(args: {
  exerciseId: number;
  sets: readonly SetFieldDraft[];
  setIndex: number;
  field: SetFieldName;
  value: string;
  previous: SetAutofill | null;
}): { sets: SetFieldDraft[]; targets: number[]; next: SetAutofill | null } {
  const { exerciseId, setIndex, field, previous } = args;
  const value = blank(args.value) ? '' : args.value;
  if (!args.sets.some((set) => set.setIndex === setIndex)) {
    return { sets: args.sets.slice(), targets: [], next: null };
  }

  const link = sameEntry(previous, exerciseId, setIndex, field)
    ? { value: previous.value, indexes: new Set(previous.linked) }
    : null;
  const targets: number[] = [];
  const following = args.sets
    .filter((set) => set.setIndex > setIndex)
    .sort((a, b) => a.setIndex - b.setIndex);
  for (const set of following) {
    if (targets.includes(set.setIndex)) continue;
    const current = set[field];
    const linked = link !== null
      && link.indexes.has(set.setIndex)
      && current === link.value
      && (value === '' || sameTyping(link.value, value));
    if (linked || (value !== '' && blank(current))) targets.push(set.setIndex);
  }

  const chosen = new Set(targets);
  const sets = args.sets.map((set) => {
    if (set.setIndex !== setIndex && !chosen.has(set.setIndex)) return set;
    if (set[field] === value) return set;
    return { ...set, [field]: value };
  });
  const next = targets.length === 0
    ? null
    : { exerciseId, setIndex, field, value, linked: targets };
  return { sets, targets, next };
}
