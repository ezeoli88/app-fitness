export type RoutineJson = {
  id: string;
  titulo: string;
  nivel: string;
  diasPorSemana: number;
  ciclo: number[];
  dias: {
    id: number;
    titulo: string;
    ejercicios: { nombre: string; series: number; reps: number }[];
  }[];
};

export type Day = { id: number; routineId: string; title: string; sort: number };

export type Exercise = {
  id: number;
  dayId: number;
  name: string;
  sets: number;
  reps: number;
  sort: number;
  archivedAt?: string | null;
};

export type SessionStatus = 'open' | 'completed' | 'partial';

export type SessionExercise = {
  id: number;
  sessionId: number;
  sourceExerciseId: number;
  name: string;
  sets: number;
  reps: number;
  sort: number;
};

export type SessionSet = {
  id: number;
  sessionExerciseId: number;
  setIndex: number;
  completed: boolean;
  weightKg: number | null;
  actualReps: number | null;
};

export type Session = {
  id: number;
  dayId: number;
  startedAt: string;
  completedAt: string | null;
  completedSets: Record<number, boolean[]>;
  status: SessionStatus;
  routineId: string;
  routineTitle: string;
  dayTitle: string;
};

export type SessionDetails = Session & {
  exercises: (SessionExercise & { series: SessionSet[] })[];
};

export type CompletedSession = Session & {
  exercisesCompleted: number;
  exercisesTotal: number;
};

export type RestTimer = {
  sessionId: number;
  dayId: number;
  exerciseId: number;
  setIndex: number;
  expiresAt: number;
  notificationId: string | null;
};

export type RoutineDayDraft = {
  id: number | null;
  title: string;
  sort: number;
  exercises: {
    id: number | null;
    name: string;
    sets: number;
    reps: number;
    sort: number;
  }[];
};

export type RoutineDraft = {
  id: string | null;
  title: string;
  level: string;
  sort: number;
  days: RoutineDayDraft[];
};
