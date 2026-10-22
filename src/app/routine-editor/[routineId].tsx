import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLayout } from '@/components/useLayout';
import { confirm } from '@/platform/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGym } from '@/db/GymContext';
import { validateRoutineDraft } from '@/domain/routine';
import type { RoutineDraft } from '@/domain/types';
import { useTheme } from '@/ThemeContext';

function blankRoutine(): RoutineDraft {
  return {
    id: null,
    title: '',
    level: 'personalizada',
    sort: 0,
    days: [{ id: null, title: 'Día 1', sort: 0, exercises: [{ id: null, name: '', sets: 3, reps: 10, sort: 0 }] }],
  };
}

export default function RoutineEditorScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const isNew = routineId === 'new';
  const gym = useGym();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { wide, maxWidth } = useLayout();
  const [draft, setDraft] = useState<RoutineDraft>(blankRoutine);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !routineId) return;
    let mounted = true;
    void gym.getRoutineDraft(routineId).then((value) => {
      if (!mounted) return;
      if (!value) {
        setError('No encontramos esa rutina. Actualizá la lista y probá otra vez.');
        setDraft(blankRoutine());
        setLoading(false);
        return;
      }
      setDraft(value);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (mounted) {
        setError(reason instanceof Error ? reason.message : 'No se pudo abrir la rutina.');
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [gym, isNew, routineId]);

  usePreventRemove(dirty && !saving, ({ data }) => {
    confirm({
      title: 'Cambios sin guardar',
      message: 'Podés guardar la rutina antes de salir.',
      actions: [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar cambios', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
      ],
    });
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || saving || typeof window === 'undefined') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, saving]);

  const change = (update: (current: RoutineDraft) => RoutineDraft) => {
    setDraft(update);
    setDirty(true);
  };

  const moveDay = (index: number, amount: number) => change((current) => {
    const days = current.days.slice();
    const destination = index + amount;
    if (destination < 0 || destination >= days.length) return current;
    [days[index], days[destination]] = [days[destination], days[index]];
    return { ...current, days: days.map((day, sort) => ({ ...day, sort, title: /^Día \d+$/.test(day.title) ? `Día ${sort + 1}` : day.title })) };
  });

  const moveExercise = (dayIndex: number, exerciseIndex: number, amount: number) => change((current) => ({
    ...current,
    days: current.days.map((day, index) => {
      if (index !== dayIndex) return day;
      const exercises = day.exercises.slice();
      const destination = exerciseIndex + amount;
      if (destination < 0 || destination >= exercises.length) return day;
      [exercises[exerciseIndex], exercises[destination]] = [exercises[destination], exercises[exerciseIndex]];
      return { ...day, exercises: exercises.map((exercise, sort) => ({ ...exercise, sort })) };
    }),
  }));

  const save = async () => {
    setError(null);
    const validation = validateRoutineDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      await gym.saveRoutine(draft);
      setDirty(false);
      router.replace('/routines');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la rutina.');
    } finally {
      setSaving(false);
    }
  };

  const accent = { color: colors.brass };
  const inputStyle = [styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth, width: '100%', alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={[styles.back, { color: colors.muted }]}>← Rutinas</Text>
        </Pressable>
        <Text style={[styles.hero, { color: colors.text }]}>{isNew ? 'Nueva rutina' : 'Editar rutina'}</Text>
        {loading ? <Text style={[styles.note, { color: colors.muted }]}>Cargando…</Text> : null}
        {!loading ? (
          <>
            <Text style={[styles.label, { color: colors.muted }]}>Nombre</Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => change((current) => ({ ...current, title }))}
              placeholder="Ej.: Fuerza de tres días"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Nombre de la rutina"
              style={inputStyle}
            />
            <Text style={[styles.label, { color: colors.muted }]}>Nivel</Text>
            <TextInput
              value={draft.level}
              onChangeText={(level) => change((current) => ({ ...current, level }))}
              placeholder="personalizada"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Nivel de la rutina"
              style={inputStyle}
            />

            <View style={styles.sectionHeading}>
              <Text style={[styles.section, { color: colors.muted }]}>Días</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => change((current) => ({
                  ...current,
                  days: [...current.days, { id: null, title: `Día ${current.days.length + 1}`, sort: current.days.length, exercises: [{ id: null, name: '', sets: 3, reps: 10, sort: 0 }] }],
                }))}>
                <Text style={[styles.link, accent]}>+ Agregar día</Text>
              </Pressable>
            </View>

            <View style={wide ? styles.dayGrid : undefined}>
            {draft.days.map((day, dayIndex) => (
              <View key={day.id ?? `new-day-${dayIndex}`} style={[styles.dayCard, wide ? styles.dayWide : null, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.dayHeader}>
                  <TextInput
                    value={day.title}
                    onChangeText={(title) => change((current) => ({
                      ...current,
                      days: current.days.map((item, index) => index === dayIndex ? { ...item, title } : item),
                    }))}
                    accessibilityLabel={`Nombre del día ${dayIndex + 1}`}
                    style={[styles.dayTitle, { color: colors.text, borderColor: colors.border }]}
                  />
                  <View style={styles.orderActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Subir día" disabled={dayIndex === 0} onPress={() => moveDay(dayIndex, -1)}>
                      <Text style={[styles.link, dayIndex === 0 ? styles.disabled : null, accent]}>↑</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Bajar día" disabled={dayIndex === draft.days.length - 1} onPress={() => moveDay(dayIndex, 1)}>
                      <Text style={[styles.link, dayIndex === draft.days.length - 1 ? styles.disabled : null, accent]}>↓</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Quitar día"
                      onPress={() => change((current) => ({ ...current, days: current.days.filter((_, index) => index !== dayIndex).map((item, sort) => ({ ...item, sort })) }))}>
                      <Text style={[styles.remove, { color: colors.muted }]}>Quitar</Text>
                    </Pressable>
                  </View>
                </View>

                {day.exercises.map((exercise, exerciseIndex) => (
                  <View key={exercise.id ?? `new-exercise-${dayIndex}-${exerciseIndex}`} style={[styles.exercise, { borderTopColor: colors.border }]}>
                    <TextInput
                      value={exercise.name}
                      onChangeText={(name) => change((current) => ({
                        ...current,
                        days: current.days.map((item, index) => index === dayIndex
                          ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, name } : row) }
                          : item),
                      }))}
                      placeholder="Nombre del ejercicio"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel={`Ejercicio ${exerciseIndex + 1} del día ${dayIndex + 1}`}
                      style={inputStyle}
                    />
                    <View style={styles.exerciseMeta}>
                      <View style={styles.numberField}>
                        <Text style={[styles.label, { color: colors.muted }]}>Series</Text>
                        <TextInput
                          value={exercise.sets ? String(exercise.sets) : ''}
                          onChangeText={(raw) => change((current) => ({
                            ...current,
                            days: current.days.map((item, index) => index === dayIndex
                              ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, sets: raw ? Number(raw.replace(/\D/g, '')) : 0 } : row) }
                              : item),
                          }))}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          accessibilityLabel={`Series previstas para ${exercise.name || 'el ejercicio'}`}
                          style={[styles.numericInput, { color: colors.text, borderColor: colors.border }]}
                        />
                      </View>
                      <View style={styles.numberField}>
                        <Text style={[styles.label, { color: colors.muted }]}>Repeticiones</Text>
                        <TextInput
                          value={exercise.reps ? String(exercise.reps) : ''}
                          onChangeText={(raw) => change((current) => ({
                            ...current,
                            days: current.days.map((item, index) => index === dayIndex
                              ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, reps: raw ? Number(raw.replace(/\D/g, '')) : 0 } : row) }
                              : item),
                          }))}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          accessibilityLabel={`Repeticiones previstas para ${exercise.name || 'el ejercicio'}`}
                          style={[styles.numericInput, { color: colors.text, borderColor: colors.border }]}
                        />
                      </View>
                      <View style={styles.orderActions}>
                        <Pressable accessibilityRole="button" accessibilityLabel="Subir ejercicio" disabled={exerciseIndex === 0} onPress={() => moveExercise(dayIndex, exerciseIndex, -1)}>
                          <Text style={[styles.link, exerciseIndex === 0 ? styles.disabled : null, accent]}>↑</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel="Bajar ejercicio" disabled={exerciseIndex === day.exercises.length - 1} onPress={() => moveExercise(dayIndex, exerciseIndex, 1)}>
                          <Text style={[styles.link, exerciseIndex === day.exercises.length - 1 ? styles.disabled : null, accent]}>↓</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Quitar ejercicio"
                          onPress={() => change((current) => ({
                            ...current,
                            days: current.days.map((item, index) => index === dayIndex
                              ? { ...item, exercises: item.exercises.filter((_, rowIndex) => rowIndex !== exerciseIndex).map((row, sort) => ({ ...row, sort })) }
                              : item),
                          }))}>
                          <Text style={[styles.remove, { color: colors.muted }]}>Quitar</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => change((current) => ({
                    ...current,
                    days: current.days.map((item, index) => index === dayIndex
                      ? { ...item, exercises: [...item.exercises, { id: null, name: '', sets: 3, reps: 10, sort: item.exercises.length }] }
                      : item),
                  }))}>
                  <Text style={[styles.link, styles.addExercise, accent]}>+ Agregar ejercicio</Text>
                </Pressable>
              </View>
            ))}
            </View>

            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.brass }]}>{error}</Text> : null}
            <Pressable onPress={() => void save()} disabled={saving} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.chalk }]}>
              <Text style={[styles.saveText, { color: colors.bg }]}>{saving ? 'Guardando…' : 'Guardar rutina'}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },
  back: { fontSize: 14, marginBottom: 18 },
  hero: { fontSize: 26, fontWeight: '600', letterSpacing: -0.7, marginBottom: 18 },
  label: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, marginTop: 10 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 15 },
  note: { fontSize: 14 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  section: { fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase' },
  link: { fontSize: 14, fontWeight: '700', paddingHorizontal: 4, paddingVertical: 6 },
  disabled: { opacity: 0.3 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dayCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  dayWide: { width: '48%' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTitle: { flex: 1, fontSize: 16, fontWeight: '600', borderBottomWidth: 1, paddingVertical: 8 },
  orderActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  remove: { fontSize: 12, paddingHorizontal: 5, paddingVertical: 6 },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  exerciseMeta: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: 'space-between' },
  numberField: { flex: 1 },
  numericInput: { height: 40, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 15 },
  addExercise: { marginTop: 8, alignSelf: 'flex-start' },
  error: { fontSize: 13, lineHeight: 19, marginTop: 18 },
  save: { borderRadius: 15, minHeight: 52, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  saveText: { fontSize: 16, fontWeight: '700' },
});
