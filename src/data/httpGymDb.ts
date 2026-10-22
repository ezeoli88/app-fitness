import { apiJson, enqueueWrite } from '@/data/http';
import type { GymDb, HomeSnapshot, SetState } from '@/db/gymDb';
import type { Routine } from '@/domain/routine';
import type {
  CompletedSession,
  Day,
  Exercise,
  RoutineDraft,
  Session,
  SessionDetails,
  SessionSet,
  SessionStatus,
  WeightHint,
} from '@/domain/types';

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Cliente HTTP con la misma forma que GymDb. Las escrituras van en una sola cola. */
export function createHttpGymDb(base: string): GymDb & { ensureBootstrapped(): Promise<void> } {
  const read = <T>(path: string) => apiJson<T>(base, path);
  const write = <T>(path: string, method: string, body?: unknown) =>
    enqueueWrite(() => apiJson<T>(base, path, { method, body }));

  return {
    ensureBootstrapped: () => write<{ seeded: boolean }>('/bootstrap', 'POST', { mode: 'seed' }).then(() => undefined),
    listRoutines: (includeArchived = false) =>
      read<Routine[]>(`/routines${query({ includeArchived: includeArchived ? 1 : undefined })}`),
    getActiveRoutine: () => read<Routine | null>('/routines/active'),
    setActiveRoutine: (id) => write<{ ok: true }>('/routines/active', 'PUT', { id }).then(() => undefined),
    getRoutineDraft: (id) => read<RoutineDraft | null>(`/routines/${encodeURIComponent(id)}/draft`),
    saveRoutine: (draft) => write<{ id: string }>('/routines', 'POST', draft).then((body) => body.id),
    duplicateRoutine: (id) =>
      write<{ id: string | null }>(`/routines/${encodeURIComponent(id)}/duplicate`, 'POST').then((body) => body.id),
    archiveRoutine: (id) => write<{ ok: true }>(`/routines/${encodeURIComponent(id)}/archive`, 'POST').then(() => undefined),
    listDays: (routineId) => read<Day[]>(`/days${query({ routineId })}`),
    listExercises: (dayId) => read<Exercise[]>(`/days/${dayId}/exercises`),
    getOpenSession: (dayId) => read<Session | null>(`/days/${dayId}/open-session`),
    listOpenSessions: () => read<Session[]>('/sessions/open'),
    getSessionDetails: (sessionId) => read<SessionDetails | null>(`/sessions/${sessionId}`),
    getOrCreateOpenSession: (dayId) => write<SessionDetails>(`/days/${dayId}/sessions`, 'POST'),
    updateSessionSet: (sessionId, exerciseId, setIndex, patch) =>
      write<{ ok: true }>(`/sessions/${sessionId}/sets`, 'PATCH', { exerciseId, setIndex, patch }).then(() => undefined),
    updateSessionSets: (sessionId, sets) =>
      write<{ ok: true }>(`/sessions/${sessionId}/sets/bulk`, 'PATCH', { sets }).then(() => undefined),
    finishSession: (sessionId, completedAt, sets) =>
      write<{ status: SessionStatus }>(`/sessions/${sessionId}/finish`, 'POST', sets ? { completedAt, sets } : { completedAt })
        .then((body) => body.status),
    reopenSession: (sessionId) => write<{ ok: true }>(`/sessions/${sessionId}/reopen`, 'POST').then(() => undefined),
    discardEmptySession: (sessionId) => write<{ ok: true }>(`/sessions/${sessionId}`, 'DELETE').then(() => undefined),
    previousExerciseSets: (routineId, exerciseId) =>
      read<SessionSet[]>(`/exercises/${exerciseId}/previous-sets${query({ routineId })}`),
    exerciseWeightHints: (exerciseIds) => exerciseIds.length === 0
      ? Promise.resolve({})
      : read<Record<number, WeightHint>>(`/exercises/weight-hints${query({ ids: exerciseIds.join(',') })}`),
    updateHistoricalSet: (setId, patch) =>
      write<{ ok: true }>(`/history/sets/${setId}`, 'PATCH', patch).then(() => undefined),
    lastCompleted: (routineId) => read<CompletedSession | null>(`/history/last${query({ routineId })}`),
    listCompleted: (limit, offset = 0, routineId) =>
      read<CompletedSession[]>(`/history${query({
        limit,
        offset,
        scope: routineId === null ? 'all' : undefined,
        routineId: typeof routineId === 'string' ? routineId : undefined,
      })}`),
    listRoutineHistory: () => read<Routine[]>('/routines?includeArchived=1'),
    getHomeSnapshot: () => read<HomeSnapshot>('/home'),
    getSetState: (sessionId, exerciseId, setIndex) =>
      read<SetState | null>(`/sessions/${sessionId}/sets/state${query({ exerciseId, setIndex })}`),
  };
}
