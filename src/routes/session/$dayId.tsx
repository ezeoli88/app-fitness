import { useQueries, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { gym } from '@/api/client';
import { SetRecord } from '@/components/SetRecord';
import { UndoToast } from '@/components/UndoToast';
import { weightPrefills } from '@/domain/prefill';
import { countCompletedSets } from '@/domain/session';
import { formatOptionalReps, formatOptionalWeight, parseRepsInput, parseWeightInput } from '@/domain/series';
import type { SessionDetails, SessionSet } from '@/domain/types';
import { refreshTraining } from '@/query';
import { useRestTimer } from '@/rest/RestTimer';
import { confirm } from '@/ui/confirm';
import { useWide } from '@/ui/layout';
import { usePageTitle } from '@/ui/pageTitle';

const UNDO_MS = 5000;
type FieldDraft = { weight: string; reps: string };
type FieldKey = `${number}:${number}`;

function key(exerciseId: number, index: number): FieldKey {
  return `${exerciseId}:${index}`;
}

function queueOperation<T>(queue: { current: Promise<unknown> }, action: () => Promise<T>): Promise<T> {
  const next = queue.current.catch(() => undefined).then(action);
  queue.current = next.catch(() => undefined);
  return next;
}

function sumTargetSets(session: SessionDetails): number {
  return session.exercises.reduce((total, exercise) => total + exercise.series.length, 0);
}

export const Route = createFileRoute('/session/$dayId')({
  component: SessionPage,
});

function SessionPage() {
  const { dayId: rawDayId } = Route.useParams();
  const dayId = Number(rawDayId);
  const navigate = useNavigate();
  const router = useRouter();
  const wide = useWide();
  const rest = useRestTimer();
  usePageTitle('Sesión');
  const valid = Number.isSafeInteger(dayId) && dayId >= 1;
  const opened = useQuery({
    queryKey: ['open-session', dayId],
    queryFn: () => gym.getOrCreateOpenSession(dayId),
    enabled: valid,
    staleTime: Infinity,
  });

  const [session, setSession] = useState<SessionDetails | null>(null);
  const sessionRef = useRef<SessionDetails | null>(null);
  const seen = useRef<number | null>(null);
  const [drafts, setDrafts] = useState<Record<FieldKey, FieldDraft>>({} as Record<FieldKey, FieldDraft>);
  const draftsRef = useRef<Record<FieldKey, FieldDraft>>({} as Record<FieldKey, FieldDraft>);
  const [toast, setToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingWrites = useRef<{ current: Promise<unknown> }>({ current: Promise.resolve() });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);
  useEffect(() => clearTimeoutRef, [clearTimeoutRef]);

  useEffect(() => {
    const data = opened.data;
    if (!data || seen.current === data.id) return;
    seen.current = data.id;
    sessionRef.current = data;
    setSession(data);
    const initial = {} as Record<FieldKey, FieldDraft>;
    for (const exercise of data.exercises) {
      for (const series of exercise.series) {
        initial[key(exercise.sourceExerciseId, series.setIndex)] = {
          weight: formatOptionalWeight(series.weightKg),
          reps: formatOptionalReps(series.actualReps),
        };
      }
    }
    draftsRef.current = initial;
    setDrafts(initial);
    setError(null);
  }, [opened.data]);

  const exerciseIds = session?.exercises.map((exercise) => exercise.sourceExerciseId) ?? [];
  const routineId = session?.routineId;
  const previousQueries = useQueries({
    queries: exerciseIds.map((exerciseId) => ({
      queryKey: ['previous-sets', routineId, exerciseId],
      queryFn: () => gym.previousExerciseSets(routineId!, exerciseId),
      enabled: Boolean(routineId),
      staleTime: 30_000,
    })),
  });
  const previous: Record<number, SessionSet[]> = {};
  exerciseIds.forEach((id, index) => { previous[id] = previousQueries[index]?.data ?? []; });

  const hints = useQuery({
    queryKey: ['weight-hints', session?.id],
    queryFn: () => gym.exerciseWeightHints(exerciseIds),
    enabled: Boolean(session),
    staleTime: Infinity,
  });
  const prefilledFor = useRef<number | null>(null);
  useEffect(() => {
    const current = sessionRef.current;
    if (!hints.data || !current || prefilledFor.current === current.id) return;
    prefilledFor.current = current.id;
    // Solo se precarga el borrador; se guarda al marcar la serie o al finalizar.
    let updated: Record<FieldKey, FieldDraft> | null = null;
    for (const fill of weightPrefills(current, hints.data)) {
      const rowKey = key(fill.exerciseId, fill.setIndex);
      const draft: FieldDraft = (updated ?? draftsRef.current)[rowKey] ?? { weight: '', reps: '' };
      if (draft.weight.trim()) continue;
      updated = { ...(updated ?? draftsRef.current), [rowKey]: { ...draft, weight: formatOptionalWeight(fill.weightKg) } };
    }
    if (!updated) return;
    draftsRef.current = updated;
    setDrafts(updated);
  }, [hints.data, session?.id]);

  const updateText = (exerciseId: number, setIndex: number, field: 'weight' | 'reps', text: string) => {
    const rowKey = key(exerciseId, setIndex);
    if (!session) return;
    const next = { ...(draftsRef.current[rowKey] ?? { weight: '', reps: '' }), [field]: text };
    draftsRef.current = { ...draftsRef.current, [rowKey]: next };
    setDrafts(draftsRef.current);
    try {
      const parsed = field === 'weight' ? parseWeightInput(text) : parseRepsInput(text);
      queueOperation(pendingWrites.current, () =>
        gym.updateSessionSet(session.id, exerciseId, setIndex, field === 'weight' ? { weightKg: parsed } : { actualReps: parsed })
      ).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar la serie.'));
    } catch {
      // Un valor parcial como "12," queda en el campo hasta salir o finalizar.
    }
  };

  const commitField = async (exerciseId: number, setIndex: number, field: 'weight' | 'reps') => {
    try {
      const draft = draftsRef.current[key(exerciseId, setIndex)] ?? { weight: '', reps: '' };
      const value = field === 'weight' ? parseWeightInput(draft.weight) : parseRepsInput(draft.reps);
      if (!session) return;
      await queueOperation(pendingWrites.current, () =>
        gym.updateSessionSet(session.id, exerciseId, setIndex, field === 'weight' ? { weightKg: value } : { actualReps: value })
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Revisá el valor ingresado.');
    }
  };

  const flushDrafts = async (): Promise<boolean> => {
    if (!session) return false;
    try {
      const changes: { exerciseId: number; index: number; weightKg: number | null; actualReps: number | null }[] = [];
      for (const exercise of session.exercises) {
        for (const series of exercise.series) {
          const draft = draftsRef.current[key(exercise.sourceExerciseId, series.setIndex)] ?? { weight: '', reps: '' };
          changes.push({
            exerciseId: exercise.sourceExerciseId,
            index: series.setIndex,
            weightKg: parseWeightInput(draft.weight),
            actualReps: parseRepsInput(draft.reps),
          });
        }
      }
      await queueOperation(pendingWrites.current, async () => {
        for (const change of changes) {
          await gym.updateSessionSet(session.id, change.exerciseId, change.index, {
            weightKg: change.weightKg,
            actualReps: change.actualReps,
          });
        }
      });
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Revisá los datos de las series.';
      setError(message);
      confirm({ title: 'Revisá los datos', message, actions: [{ text: 'Entendido' }] });
      return false;
    }
  };

  const onToggle = (exerciseId: number, setIndex: number) => {
    const current = sessionRef.current;
    if (!current || current.status !== 'open' || toast) return;
    const exercise = current.exercises.find((item) => item.sourceExerciseId === exerciseId);
    const series = exercise?.series.find((item) => item.setIndex === setIndex);
    if (!exercise || !series) return;
    let weightKg: number | null;
    let actualReps: number | null;
    try {
      const draft = draftsRef.current[key(exerciseId, setIndex)] ?? {
        weight: formatOptionalWeight(series.weightKg),
        reps: formatOptionalReps(series.actualReps),
      };
      weightKg = parseWeightInput(draft.weight);
      actualReps = parseRepsInput(draft.reps);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Revisá los datos de la serie.');
      return;
    }
    const completed = !series.completed;
    const marks = current.completedSets[exerciseId] ?? exercise.series.map((set) => set.completed);
    const next: SessionDetails = {
      ...current,
      completedSets: {
        ...current.completedSets,
        [exerciseId]: marks.map((value, index) => index === setIndex ? completed : value),
      },
      exercises: current.exercises.map((item) => item.sourceExerciseId === exerciseId
        ? { ...item, series: item.series.map((set) => set.setIndex === setIndex ? { ...set, completed, weightKg, actualReps } : set) }
        : item),
    };
    sessionRef.current = next;
    setSession(next);
    setError(null);
    const remaining = next.exercises.some((item) => item.series.some((set) => !set.completed));
    const timerAction = completed
      ? remaining ? rest.startRest(current.id, dayId, exerciseId, setIndex) : rest.skipRest(current.id)
      : rest.skipRest(current.id, exerciseId, setIndex);
    void timerAction.catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar el descanso.'));
    void queueOperation(pendingWrites.current, () =>
      gym.updateSessionSet(current.id, exerciseId, setIndex, { completed, weightKg, actualReps })
    ).catch(async (reason) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el progreso.');
      if (completed) void rest.skipRest(current.id, exerciseId, setIndex).catch(() => undefined);
      try {
        await pendingWrites.current.current;
        const saved = await gym.getSessionDetails(current.id);
        if (saved) {
          sessionRef.current = saved;
          setSession(saved);
        }
      } catch {
        // La próxima apertura vuelve a leer el estado guardado.
      }
    });
  };

  const copyPrevious = async (exerciseId: number) => {
    if (!session || session.status !== 'open') return;
    const previousSets = previous[exerciseId] ?? [];
    const exercise = session.exercises.find((item) => item.sourceExerciseId === exerciseId);
    if (!exercise || previousSets.length === 0) return;
    const updated = { ...draftsRef.current };
    for (let index = 0; index < exercise.series.length; index++) {
      const prior = previousSets[index];
      if (!prior) continue;
      updated[key(exerciseId, index)] = {
        weight: formatOptionalWeight(prior.weightKg),
        reps: formatOptionalReps(prior.actualReps),
      };
    }
    draftsRef.current = updated;
    setDrafts(updated);
    await queueOperation(pendingWrites.current, async () => {
      for (let index = 0; index < exercise.series.length; index++) {
        const prior = previousSets[index];
        if (!prior) continue;
        await gym.updateSessionSet(session.id, exerciseId, index, { weightKg: prior.weightKg, actualReps: prior.actualReps });
      }
    });
    const refreshed = await gym.getSessionDetails(session.id);
    sessionRef.current = refreshed;
    setSession(refreshed);
  };

  const discardEmptySession = async () => {
    if (!session) return;
    await pendingWrites.current.current.catch(() => undefined);
    await gym.discardEmptySession(session.id);
    await rest.skipRest(session.id);
    await refreshTraining();
    await navigate({ to: '/', replace: true });
  };

  const discardEmpty = () => {
    if (!session) return;
    confirm({
      title: 'Descartar entrenamiento vacío',
      message: 'Esta sesión no se guardará en el historial.',
      actions: [
        { text: 'Seguir entrenando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => { void discardEmptySession().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo descartar la sesión.')); } },
      ],
    });
  };

  const finish = async () => {
    if (!session || session.status !== 'open' || !(await flushDrafts())) return;
    const fresh = await gym.getSessionDetails(session.id);
    if (!fresh) {
      setError('No encontramos la sesión abierta.');
      return;
    }
    setSession(fresh);
    sessionRef.current = fresh;
    const completed = countCompletedSets(fresh.completedSets);
    if (completed === 0) {
      confirm({
        title: 'Entrenamiento vacío',
        message: 'No hay series registradas.',
        actions: [
          { text: 'Seguir entrenando', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: () => { void discardEmptySession().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo descartar la sesión.')); } },
        ],
      });
      return;
    }
    const total = sumTargetSets(fresh);
    const confirmFinish = () => {
      void (async () => {
        try {
          await rest.skipRest(session.id);
          if (!(await flushDrafts())) return;
          const status = await queueOperation(pendingWrites.current, () => gym.finishSession(session.id, new Date().toISOString()));
          const finished = sessionRef.current ? { ...sessionRef.current, status, completedAt: new Date().toISOString() } : null;
          sessionRef.current = finished;
          setSession(finished);
          setToast(true);
          await refreshTraining();
          timeoutRef.current = setTimeout(() => { void navigate({ to: '/', replace: true }); }, UNDO_MS);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'No se pudo finalizar la sesión.');
        }
      })();
    };
    if (completed < total) {
      confirm({
        title: 'Finalizar entrenamiento',
        message: `Registraste ${completed} de ${total} series. Podés terminar esta sesión ahora.`,
        actions: [
          { text: 'Seguir entrenando', style: 'cancel' },
          { text: 'Finalizar sesión', onPress: confirmFinish },
        ],
      });
    } else confirmFinish();
  };

  const undo = async () => {
    if (!session || session.status === 'open') return;
    clearTimeoutRef();
    try {
      await gym.reopenSession(session.id);
      const reopened = sessionRef.current ? { ...sessionRef.current, status: 'open' as const, completedAt: null } : null;
      sessionRef.current = reopened;
      setSession(reopened);
      setToast(false);
      await refreshTraining();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo reabrir la sesión.');
    }
  };

  const goBack = () => {
    if (session?.completedAt) void navigate({ to: '/', replace: true });
    else if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: '/' });
  };

  const completedSets = session ? countCompletedSets(session.completedSets) : 0;
  const totalSetCount = session ? sumTargetSets(session) : 0;
  const minutes = Math.floor(rest.remainingSeconds / 60);
  const seconds = rest.remainingSeconds % 60;
  const loadError = !valid
    ? 'No encontramos ese día de entrenamiento.'
    : opened.isError
      ? (opened.error instanceof Error ? opened.error.message : 'No se pudo abrir el entrenamiento.')
      : null;

  const actions = session?.status === 'open' ? (
    <div className="session-actions">
      <button type="button" className="finish" onClick={() => void finish().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo finalizar la sesión.'))}>Finalizar entrenamiento</button>
      {completedSets === 0 ? <button type="button" className="discard" onClick={discardEmpty}>Descartar sesión vacía</button> : null}
    </div>
  ) : null;

  return (
    <div className={wide ? 'session-frame wide' : 'session-frame'}>
      <div className="session-main">
        <div className="session-header">
          <button type="button" className="back" onClick={goBack}>← Inicio</button>
          <p className="counter">{completedSets} / {totalSetCount} series</p>
        </div>
        <p className="session-kicker">{session?.routineTitle ?? 'ENTRENAMIENTO'}</p>
        <h1 className="session-hero">{session?.dayTitle ?? ''}</h1>
        {loadError || error ? <p className="error" role="alert">{error ?? loadError}</p> : null}
        {opened.isPending && valid ? <p className="note">Cargando…</p> : null}
        {session?.exercises.map((exercise) => {
          const prior = previous[exercise.sourceExerciseId] ?? [];
          return (
            <section key={exercise.id} className="session-block">
              <div className="exercise-head">
                <div>
                  <h2 className="exercise-name">{exercise.name}</h2>
                  <p className="meta">
                    Objetivo: {exercise.sets} × {exercise.reps}
                    {hints.data?.[exercise.sourceExerciseId]?.targetWeightKg != null
                      ? ` · ${formatOptionalWeight(hints.data[exercise.sourceExerciseId].targetWeightKg)} kg`
                      : ''}
                  </p>
                </div>
                {prior.length > 0 && session.status === 'open' ? (
                  <button type="button" className="copy" onClick={() => void copyPrevious(exercise.sourceExerciseId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron copiar los valores anteriores.'))}>Copiar anterior</button>
                ) : null}
              </div>
              {prior.length > 0 ? (
                <p className="previous">
                  Anterior: {prior.map((set, index) => `S${index + 1}: ${set.completed ? `${set.weightKg === null ? 'Sin dato' : `${formatOptionalWeight(set.weightKg)} kg`} × ${formatOptionalReps(set.actualReps) || 'Sin dato'}` : 'Pendiente'}`).join(' · ')}
                </p>
              ) : null}
              {exercise.series.map((series) => {
                const draft = drafts[key(exercise.sourceExerciseId, series.setIndex)] ?? {
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
                    editable={session.status === 'open'}
                    onWeightChange={(value) => updateText(exercise.sourceExerciseId, series.setIndex, 'weight', value)}
                    onRepsChange={(value) => updateText(exercise.sourceExerciseId, series.setIndex, 'reps', value)}
                    onWeightCommit={() => void commitField(exercise.sourceExerciseId, series.setIndex, 'weight')}
                    onRepsCommit={() => void commitField(exercise.sourceExerciseId, series.setIndex, 'reps')}
                    onToggle={session.status === 'open' ? () => onToggle(exercise.sourceExerciseId, series.setIndex) : undefined}
                  />
                );
              })}
            </section>
          );
        })}
        {wide ? null : actions}
      </div>
      {wide ? (
        <aside className="session-side">
          {rest.activeTimer ? (
            <div className="side-rest">
              <p className="resume-kicker">DESCANSO</p>
              <p className="side-time">{minutes}:{String(seconds).padStart(2, '0')}</p>
              <button type="button" className="copy" onClick={() => void rest.extendRest()}>+30 s</button>
              <button type="button" className="copy" onClick={() => void rest.skipRest()}>Omitir</button>
            </div>
          ) : null}
          {actions}
        </aside>
      ) : null}
      <UndoToast visible={toast} message={session?.status === 'partial' ? 'Sesión parcial guardada' : 'Entrenamiento guardado'} onUndo={() => void undo()} />
    </div>
  );
}
