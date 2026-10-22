import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SetRecord } from '@/components/SetRecord';
import { useGym } from '@/db/GymContext';
import { formatOptionalReps, formatOptionalWeight, parseRepsInput, parseWeightInput } from '@/domain/series';
import type { SessionDetails, SessionSet } from '@/domain/types';
import { useTheme } from '@/ThemeContext';

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
  const gym = useGym();
  const router = useRouter();
  const { colors } = useTheme();
  const draftsRef = useRef<Record<string, FieldDraft>>({});
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const writes = useRef<{ current: Promise<unknown> }>({ current: Promise.resolve() });

  useEffect(() => {
    let mounted = true;
    setSession(null);
    setError(null);
    void gym.getSessionDetails(sessionId).then((details) => {
      if (!mounted) return;
      if (!details) {
        setError('No encontramos esta sesión en tu historial.');
        return;
      }
      if (details.status === 'open') {
        router.replace(`/session/${details.dayId}`);
        return;
      }
      setSession(details);
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
    }).catch((reason: unknown) => {
      if (mounted) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el historial.');
    });
    return () => { mounted = false; };
  }, [gym, sessionId, router]);

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

  const completed = session?.exercises.reduce(
    (total, exercise) => total + exercise.series.filter((series) => series.completed).length,
    0
  ) ?? 0;
  const planned = session?.exercises.reduce((total, exercise) => total + exercise.sets, 0) ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {embedded ? null : (
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/history')} accessibilityRole="button">
          <Text style={[styles.back, { color: colors.muted }]}>← Sesiones</Text>
        </Pressable>
      )}
      <Text style={[styles.kicker, { color: colors.muted }]}>{session?.routineTitle}</Text>
      <Text style={[styles.hero, { color: colors.text }]}>{session?.dayTitle}</Text>
      {session ? (
        <>
          <Text style={[styles.date, { color: colors.muted }]}>{dateLabel(session.completedAt)}</Text>
          <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Estado</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {session.status === 'partial' ? 'Parcial' : 'Completa'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Series realizadas</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{completed} / {planned}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Ejercicios</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {session.exercises.filter((exercise) => exercise.series.some((series) => series.completed)).length} / {session.exercises.length}
              </Text>
            </View>
          </View>
          <Text style={[styles.note, { color: colors.muted }]}>Los pesos y repeticiones se guardan al editarlos. “Sin dato” indica que no se registraron.</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.brass }]}>{error}</Text> : null}
          {session.exercises.map((exercise) => (
            <View key={exercise.id} style={[styles.exercise, { borderTopColor: colors.border }]}>
              <View style={styles.exerciseHeader}>
                <Text style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text>
                <Text style={[styles.target, { color: colors.muted }]}>{exercise.sets} × {exercise.reps}</Text>
              </View>
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
            </View>
          ))}
        </>
      ) : error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.brass }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 42 },
  back: { fontSize: 14, marginBottom: 20 },
  kicker: { fontSize: 11, letterSpacing: 1.7, textTransform: 'uppercase' },
  hero: { fontSize: 24, fontWeight: '600', marginTop: 5 },
  date: { fontSize: 13, marginTop: 9 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 18, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 13 },
  error: { fontSize: 13, marginTop: 13 },
  exercise: { paddingVertical: 16, borderTopWidth: 1, marginTop: 10 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  exerciseName: { flex: 1, fontSize: 16, fontWeight: '600' },
  target: { fontSize: 13 },
});
