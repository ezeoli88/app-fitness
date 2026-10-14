import type { Day, RoutineDraft } from '@/domain/types';

export type Routine = {
  id: string;
  title: string;
  level: string;
  sort: number;
  archivedAt?: string | null;
};

export function pickActiveRoutine(routines: Routine[], activeId: string | null | undefined): Routine | null {
  const available = routines.filter((routine) => !routine.archivedAt);
  if (available.length === 0) return null;
  const match = available.find((routine) => routine.id === activeId);
  if (match) return match;
  return available.find((routine) => routine.id === 'principiantes') ?? available[0];
}

export function nextTrainingDay(days: Day[], lastDayId: number | null): Day | null {
  if (days.length === 0) return null;
  if (lastDayId === null) return days[0];
  const lastIndex = days.findIndex((day) => day.id === lastDayId);
  if (lastIndex < 0) return days[0];
  return days[(lastIndex + 1) % days.length];
}

export function validateRoutineDraft(draft: RoutineDraft): string | null {
  if (!draft.title.trim()) return 'La rutina necesita un nombre.';
  if (draft.days.length === 0) return 'Agregá al menos un día.';
  for (const day of draft.days) {
    if (!day.title.trim()) return 'Todos los días necesitan un nombre.';
    if (day.exercises.length === 0) return `${day.title}: agregá al menos un ejercicio.`;
    for (const exercise of day.exercises) {
      if (!exercise.name.trim()) return `${day.title}: todos los ejercicios necesitan un nombre.`;
      if (!Number.isSafeInteger(exercise.sets) || exercise.sets < 1) {
        return `${exercise.name}: ingresá una cantidad de series válida.`;
      }
      if (!Number.isSafeInteger(exercise.reps) || exercise.reps < 1) {
        return `${exercise.name}: ingresá una cantidad de repeticiones válida.`;
      }
    }
  }
  return null;
}
