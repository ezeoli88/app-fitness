export type RoutineJson = {
  nombre: string;
  diasPorSemana: number;
  ciclo: number[];
  dias: {
    id: number;
    titulo: string;
    ejercicios: { nombre: string; series: number; reps: number }[];
  }[];
};

export type Day = { id: number; title: string; sort: number };

export type Exercise = {
  id: number;
  dayId: number;
  name: string;
  sets: number;
  reps: number;
  sort: number;
};

export type Session = {
  id: number;
  dayId: number;
  startedAt: string;
  completedAt: string | null;
  completedSets: Record<number, boolean[]>;
};

export type CompletedSession = Session & { dayTitle: string };
