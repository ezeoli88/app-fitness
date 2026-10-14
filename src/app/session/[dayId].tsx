import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SetRecord } from '@/components/SetRecord';
import { UndoToast } from '@/components/UndoToast';
import { useGym } from '@/db/GymContext';
import { useRestTimer } from '@/db/RestTimerContext';
import { countCompletedSets } from '@/domain/session';
import { formatOptionalReps, formatOptionalWeight, parseRepsInput, parseWeightInput } from '@/domain/series';
import type { SessionDetails, SessionSet } from '@/domain/types';
import { useTheme } from '@/ThemeContext';

const UNDO_MS = 5000;
type FieldDraft = { weight: string; reps: string };
type FieldKey = `${number}:${number}`;

function key(exerciseId: number, index: number): FieldKey {
  return `${exerciseId}:${index}`;
}

function queueOperation<T>(
  queue: { current: Promise<unknown> },
  action: () => Promise<T>
): Promise<T> {
  const next = queue.current.catch(() => undefined).then(action);
  queue.current = next.catch(() => undefined);
  return next;
}

function sumTargetSets(session: SessionDetails): number {
  return session.exercises.reduce((total, exercise) => total + exercise.series.length, 0);
}

export default function SessionScreen() {
  const { dayId: rawDayId } = useLocalSearchParams<{ dayId: string }>();
  const dayId = Number(rawDayId);
  const gym = useGym();
  const router = useRouter();
  const { colors } = useTheme();
  const rest = useRestTimer();

  const [session, setSession] = useState<SessionDetails | null>(null);
  const sessionRef = useRef<SessionDetails | null>(null);
  const [drafts, setDrafts] = useState<Record<FieldKey, FieldDraft>>({} as Record<FieldKey, FieldDraft>);
  const draftsRef = useRef<Record<FieldKey, FieldDraft>>({} as Record<FieldKey, FieldDraft>);
  const [previous, setPrevious] = useState<Record<number, SessionSet[]>>({});
  const [toast, setToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingWrites = useRef<{ current: Promise<unknown> }>({ current: Promise.resolve() });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => clearTimeoutRef, [clearTimeoutRef]);

  const load = useCallback(async () => {
    if (!Number.isSafeInteger(dayId) || dayId < 1) {
      setError('No encontramos ese día de entrenamiento.');
      return;
    }
    try {
      const opened = await gym.getOrCreateOpenSession(dayId);
      sessionRef.current = opened;
      setSession(opened);
      const initialDrafts: Record<string, FieldDraft> = {};
      for (const exercise of opened.exercises) {
        for (const series of exercise.series) {
          initialDrafts[key(exercise.sourceExerciseId, series.setIndex)] = {
            weight: formatOptionalWeight(series.weightKg),
            reps: formatOptionalReps(series.actualReps),
          };
        }
      }
      setDrafts(initialDrafts as Record<FieldKey, FieldDraft>);
      draftsRef.current = initialDrafts as Record<FieldKey, FieldDraft>;
      setError(null);
      const history = await Promise.all(
        opened.exercises.map(async (exercise) => [
          exercise.sourceExerciseId,
          await gym.previousExerciseSets(opened.routineId, exercise.sourceExerciseId),
        ] as const)
      );
      setPrevious(Object.fromEntries(history));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo abrir el entrenamiento.');
    }
  }, [dayId, gym]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateText = (
    exerciseId: number,
    setIndex: number,
    field: 'weight' | 'reps',
    text: string
  ) => {
    const rowKey = key(exerciseId, setIndex);
    if (!session) return;
    const next = { ...(draftsRef.current[rowKey] ?? { weight: '', reps: '' }), [field]: text };
    draftsRef.current = { ...draftsRef.current, [rowKey]: next };
    setDrafts(draftsRef.current);
    try {
      const parsed = field === 'weight' ? parseWeightInput(text) : parseRepsInput(text);
      queueOperation(pendingWrites.current, () =>
        gym.updateSessionSet(session.id, exerciseId, setIndex,
          field === 'weight' ? { weightKg: parsed } : { actualReps: parsed })
      ).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar la serie.'));
    } catch {
      // Partial input such as "12," is kept in the field and validated at blur or finish.
    }
  };

  const commitField = async (
    exerciseId: number,
    setIndex: number,
    field: 'weight' | 'reps'
  ) => {
    try {
      const draft = draftsRef.current[key(exerciseId, setIndex)] ?? { weight: '', reps: '' };
      const value = field === 'weight' ? parseWeightInput(draft.weight) : parseRepsInput(draft.reps);
      if (!session) return;
      await queueOperation(pendingWrites.current, () =>
        gym.updateSessionSet(session.id, exerciseId, setIndex,
          field === 'weight' ? { weightKg: value } : { actualReps: value })
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
      Alert.alert('Revisá los datos', message);
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
        [exerciseId]: marks.map((value, index) =>
          index === setIndex ? completed : value
        ),
      },
      exercises: current.exercises.map((item) => item.sourceExerciseId === exerciseId
        ? { ...item, series: item.series.map((set) => set.setIndex === setIndex
          ? { ...set, completed, weightKg, actualReps }
          : set) }
        : item),
    };
    sessionRef.current = next;
    setSession(next);
    setError(null);

    const remaining = next.exercises.some((item) => item.series.some((set) => !set.completed));
    const timerAction = completed
      ? remaining
        ? rest.startRest(current.id, dayId, exerciseId, setIndex)
        : rest.skipRest(current.id)
      : rest.skipRest(current.id, exerciseId, setIndex);
    void timerAction.catch((reason) =>
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el descanso.')
    );

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
        // The saved state will be loaded again when the screen is reopened.
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
        await gym.updateSessionSet(session.id, exerciseId, index, {
          weightKg: prior.weightKg,
          actualReps: prior.actualReps,
        });
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
    router.replace('/');
  };

  const discardEmpty = () => {
    if (!session) return;
    Alert.alert('Descartar entrenamiento vacío', 'Esta sesión no se guardará en el historial.', [
      { text: 'Seguir entrenando', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => {
          void discardEmptySession().catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : 'No se pudo descartar la sesión.')
          );
        },
      },
    ]);
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
      Alert.alert('Entrenamiento vacío', 'No hay series registradas.', [
        { text: 'Seguir entrenando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => {
          void discardEmptySession().catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : 'No se pudo descartar la sesión.')
          );
        } },
      ]);
      return;
    }
    const total = sumTargetSets(fresh);
    const confirm = () => {
      void (async () => {
        try {
          await rest.skipRest(session.id);
          if (!(await flushDrafts())) return;
          const status = await queueOperation(pendingWrites.current, () => gym.finishSession(session.id, new Date().toISOString()));
          const finished = sessionRef.current ? { ...sessionRef.current, status, completedAt: new Date().toISOString() } : null;
          sessionRef.current = finished;
          setSession(finished);
          setToast(true);
          timeoutRef.current = setTimeout(() => {
            router.replace('/');
          }, UNDO_MS);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'No se pudo finalizar la sesión.');
        }
      })();
    };
    if (completed < total) {
      Alert.alert('Finalizar entrenamiento', `Registraste ${completed} de ${total} series. Podés terminar esta sesión ahora.`, [
        { text: 'Seguir entrenando', style: 'cancel' },
        { text: 'Finalizar sesión', onPress: confirm },
      ]);
    } else {
      confirm();
    }
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo reabrir la sesión.');
    }
  };

  const completedSets = session ? countCompletedSets(session.completedSets) : 0;
  const totalSets = session ? sumTargetSets(session) : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => session?.completedAt ? router.replace('/') : router.back()}>
            <Text style={[styles.back, { color: colors.muted }]}>← Inicio</Text>
          </Pressable>
          <Text style={[styles.counter, { color: colors.brass }]}>{completedSets} / {totalSets} series</Text>
        </View>
        <Text style={[styles.kicker, { color: colors.muted }]}>{session?.routineTitle ?? 'ENTRENAMIENTO'}</Text>
        <Text style={[styles.hero, { color: colors.text }]}>{session?.dayTitle ?? ''}</Text>

        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.brass }]}>{error}</Text> : null}

        {session?.exercises.map((exercise) => {
          const prior = previous[exercise.sourceExerciseId] ?? [];
          return (
            <View key={exercise.id} style={[styles.exercise, { borderTopColor: colors.border }]}>
              <View style={styles.exerciseHead}>
                <View style={styles.exerciseNames}>
                  <Text style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>Objetivo: {exercise.sets} × {exercise.reps}</Text>
                </View>
                {prior.length > 0 && session.status === 'open' ? (
                  <Pressable onPress={() => void copyPrevious(exercise.sourceExerciseId).catch((reason: unknown) =>
                    setError(reason instanceof Error ? reason.message : 'No se pudieron copiar los valores anteriores.')
                  )} accessibilityRole="button">
                    <Text style={[styles.copy, { color: colors.brass }]}>Copiar anterior</Text>
                  </Pressable>
                ) : null}
              </View>
              {prior.length > 0 ? (
                <Text style={[styles.previous, { color: colors.muted }]}>
                  Anterior: {prior.map((set, index) => `S${index + 1}: ${set.completed ? `${set.weightKg === null ? 'Sin dato' : `${formatOptionalWeight(set.weightKg)} kg`} × ${formatOptionalReps(set.actualReps) || 'Sin dato'}` : 'Pendiente'}`).join(' · ')}
                </Text>
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
                    onToggle={session.status === 'open'
                      ? () => void onToggle(exercise.sourceExerciseId, series.setIndex)
                      : undefined}
                  />
                );
              })}
            </View>
          );
        })}

        {session?.status === 'open' ? (
          <View style={styles.actions}>
            <Pressable onPress={() => void finish().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo finalizar la sesión.'))} accessibilityRole="button" style={[styles.finish, { backgroundColor: colors.chalk }]}>
              <Text style={[styles.finishText, { color: colors.bg }]}>Finalizar entrenamiento</Text>
            </Pressable>
            {completedSets === 0 ? (
              <Pressable onPress={discardEmpty} accessibilityRole="button" style={styles.discard}>
                <Text style={[styles.discardText, { color: colors.muted }]}>Descartar sesión vacía</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <UndoToast visible={toast} message={session?.status === 'partial' ? 'Sesión parcial guardada' : 'Entrenamiento guardado'} onUndo={() => void undo()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 115 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  back: { fontSize: 14 },
  counter: { fontSize: 13, fontWeight: '600' },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  hero: { fontSize: 24, fontWeight: '600', letterSpacing: -0.6, marginTop: 4, marginBottom: 20 },
  error: { fontSize: 13, marginBottom: 12 },
  exercise: { paddingVertical: 17, borderTopWidth: 1 },
  exerciseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  exerciseNames: { flex: 1 },
  exerciseName: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 5 },
  copy: { fontSize: 12, fontWeight: '600' },
  previous: { fontSize: 12, marginTop: 9 },
  actions: { marginTop: 22, alignItems: 'center', gap: 14 },
  finish: { borderRadius: 15, minHeight: 52, justifyContent: 'center', alignItems: 'center', alignSelf: 'stretch' },
  finishText: { fontSize: 16, fontWeight: '700' },
  discard: { padding: 8 },
  discardText: { fontSize: 14 },
});
