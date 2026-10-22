import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { gym } from '@/api/client';
import { SetRecord } from '@/components/SetRecord';
import { formatOptionalReps, formatOptionalWeight, parseRepsInput, parseWeightInput } from '@/domain/series';
import type { SessionSet } from '@/domain/types';

type FieldDraft = { weight: string; reps: string };

function queueOperation(queue: { current: Promise<unknown> }, action: () => Promise<unknown>): Promise<unknown> {
  const next = queue.current.catch(() => undefined).then(action);
  queue.current = next.catch(() => undefined);
  return next;
}

function dateLabel(value: string | null): string {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

export function SessionDetailView({ sessionId, embedded = false }: { sessionId: number; embedded?: boolean }) {
  const navigate = useNavigate();
  const draftsRef = useRef<Record<string, FieldDraft>>({});
  const loadedId = useRef<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const writes = useRef<{ current: Promise<unknown> }>({ current: Promise.resolve() });
  const valid = Number.isSafeInteger(sessionId) && sessionId >= 1;
  const query = useQuery({
    queryKey: ['session-detail', sessionId],
    queryFn: () => gym.getSessionDetails(sessionId),
    enabled: valid,
    staleTime: Infinity,
  });

  useEffect(() => {
    const details = query.data;
    if (!details || details.status === 'open' || loadedId.current === details.id) return;
    loadedId.current = details.id;
    const initial: Record<string, FieldDraft> = {};
    for (const exercise of details.exercises) {
      for (const series of exercise.series) {
        initial[String(series.id)] = {
          weight: formatOptionalWeight(series.weightKg),
          reps: formatOptionalReps(series.actualReps),
        };
      }
    }
    draftsRef.current = initial;
    setDrafts(initial);
  }, [query.data]);

  useEffect(() => {
    const details = query.data;
    if (details?.status !== 'open') return;
    void navigate({ to: '/session/$dayId', params: { dayId: String(details.dayId) }, replace: true });
  }, [navigate, query.data]);

  const updateText = (set: SessionSet, field: 'weight' | 'reps', text: string) => {
    draftsRef.current = {
      ...draftsRef.current,
      [String(set.id)]: { ...(draftsRef.current[String(set.id)] ?? { weight: '', reps: '' }), [field]: text },
    };
    setDrafts(draftsRef.current);
    if (!set.completed) return;
    try {
      const value = field === 'weight' ? parseWeightInput(text) : parseRepsInput(text);
      void queueOperation(writes.current, () =>
        gym.updateHistoricalSet(set.id, field === 'weight' ? { weightKg: value } : { actualReps: value })
      ).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar el cambio.'));
    } catch {
      // El valor incompleto se confirma al salir del campo.
    }
  };

  const commit = async (series: SessionSet, field: 'weight' | 'reps') => {
    if (!series.completed) return;
    const draft = draftsRef.current[String(series.id)] ?? { weight: '', reps: '' };
    try {
      const value = field === 'weight' ? parseWeightInput(draft.weight) : parseRepsInput(draft.reps);
      await queueOperation(writes.current, () =>
        gym.updateHistoricalSet(series.id, field === 'weight' ? { weightKg: value } : { actualReps: value })
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Revisá el valor ingresado.');
    }
  };

  const session = query.data && query.data.status !== 'open' ? query.data : null;
  const completed = session?.exercises.reduce((total, exercise) => total + exercise.series.filter((series) => series.completed).length, 0) ?? 0;
  const planned = session?.exercises.reduce((total, exercise) => total + exercise.sets, 0) ?? 0;
  const message = !valid
    ? 'No encontramos esta sesión en tu historial.'
    : error ?? (query.isError ? (query.error instanceof Error ? query.error.message : 'No se pudo cargar el historial.') : null)
      ?? (query.isSuccess && !query.data ? 'No encontramos esta sesión en tu historial.' : null);

  return (
    <div className={embedded ? '' : 'page'}>
      {embedded ? null : (
        <button type="button" className="back" onClick={() => void navigate({ to: '/history' })}>← Sesiones</button>
      )}
      {session ? (
        <>
          <p className="session-kicker">{session.routineTitle}</p>
          <h1 className="session-hero">{session.dayTitle}</h1>
          <p className="detail-date">{dateLabel(session.completedAt)}</p>
          <div className="summary">
            <div className="summary-row"><span className="summary-label">Estado</span><span className="summary-value">{session.status === 'partial' ? 'Parcial' : 'Completa'}</span></div>
            <div className="summary-row"><span className="summary-label">Series realizadas</span><span className="summary-value">{completed} / {planned}</span></div>
            <div className="summary-row">
              <span className="summary-label">Ejercicios</span>
              <span className="summary-value">{session.exercises.filter((exercise) => exercise.series.some((series) => series.completed)).length} / {session.exercises.length}</span>
            </div>
          </div>
          <p className="note detail-note">Los pesos y repeticiones se guardan al editarlos. “Sin dato” indica que no se registraron.</p>
          {message ? <p className="error" role="alert">{message}</p> : null}
          {session.exercises.map((exercise) => (
            <section key={exercise.id} className="session-block">
              <div className="exercise-head">
                <h2 className="exercise-name">{exercise.name}</h2>
                <span className="meta">{exercise.sets} × {exercise.reps}</span>
              </div>
              {exercise.series.map((series) => {
                const draft = drafts[String(series.id)] ?? {
                  weight: formatOptionalWeight(series.weightKg),
                  reps: formatOptionalReps(series.actualReps),
                };
                return (
                  <SetRecord
                    key={series.id}
                    index={series.setIndex}
                    targetReps={exercise.reps}
                    result={series}
                    weightText={draft.weight}
                    repsText={draft.reps}
                    editable={series.completed}
                    onWeightChange={(value) => updateText(series, 'weight', value)}
                    onRepsChange={(value) => updateText(series, 'reps', value)}
                    onWeightCommit={() => void commit(series, 'weight')}
                    onRepsCommit={() => void commit(series, 'reps')}
                  />
                );
              })}
            </section>
          ))}
        </>
      ) : message ? <p className="error" role="alert">{message}</p> : <p className="note">Cargando…</p>}
    </div>
  );
}
