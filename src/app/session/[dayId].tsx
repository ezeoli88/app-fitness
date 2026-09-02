import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SetPips } from '@/components/SetPips';
import { UndoToast } from '@/components/UndoToast';
import { useGym } from '@/db/GymContext';
import {
  applyToggle,
  countCompletedSets,
  ensureExerciseMarks,
  findClosingToggle,
  isExerciseComplete,
  totalSets,
} from '@/domain/session';
import type { Day, Exercise, Session } from '@/domain/types';
import { colors } from '@/theme';

const UNDO_MS = 5000;

type ToastState = {
  sessionId: number;
  exerciseId: number;
  setIndex: number;
  setCount: number;
  completedSets: Record<number, boolean[]>;
};

export default function SessionScreen() {
  const { dayId: rawDayId } = useLocalSearchParams<{ dayId: string }>();
  const dayId = Number(rawDayId);
  const gym = useGym();
  const router = useRouter();

  const [day, setDay] = useState<Day | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimeoutRef();
  }, []);

  useEffect(() => {
    if (!Number.isFinite(dayId)) return;
    void (async () => {
      const days = await gym.listDays();
      setDay(days.find((item) => item.id === dayId) ?? null);
      const listed = await gym.listExercises(dayId);
      setExercises(listed);
      const open = await gym.getOrCreateOpenSession(dayId);
      setSession(open);
    })();
  }, [dayId, gym]);

  const goHome = useCallback(() => {
    router.replace('/');
  }, [router]);

  const onToggle = async (exercise: Exercise, setIndex: number) => {
    if (!session || toast) return;

    const before = session.completedSets;
    const after = applyToggle({
      completedSets: before,
      exerciseId: exercise.id,
      setIndex,
      setCount: exercise.sets,
    });
    const closing = findClosingToggle({
      exercises,
      before,
      after,
    });

    const nextSession = { ...session, completedSets: after };
    await gym.saveOpenSession(nextSession);
    setSession(nextSession);

    if (!closing) return;

    const completedAt = new Date().toISOString();
    await gym.closeSession(session.id, completedAt);
    setToast({
      sessionId: session.id,
      exerciseId: closing.exerciseId,
      setIndex: closing.setIndex,
      setCount: exercise.sets,
      completedSets: after,
    });
    timeoutRef.current = setTimeout(goHome, UNDO_MS);
  };

  const onUndo = async () => {
    if (!toast || !session) return;
    clearTimeoutRef();
    const reopened = applyToggle({
      completedSets: toast.completedSets,
      exerciseId: toast.exerciseId,
      setIndex: toast.setIndex,
      setCount: toast.setCount,
    });
    await gym.reopenSession(toast.sessionId, reopened);
    setSession({
      ...session,
      completedAt: null,
      completedSets: reopened,
    });
    setToast(null);
  };

  const done = session ? countCompletedSets(session.completedSets) : 0;
  const total = totalSets(exercises);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (toast) return;
              router.back();
            }}
            accessibilityRole="button">
            <Text style={styles.back}>← Inicio</Text>
          </Pressable>
          <Text style={styles.counter}>
            {done} / {total} series
          </Text>
        </View>
        <Text style={styles.kicker}>Día {day?.sort != null ? day.sort + 1 : ''}</Text>
        <Text style={styles.hero}>{day?.title ?? ''}</Text>

        {exercises.map((exercise) => {
          const marks = session
            ? ensureExerciseMarks(session.completedSets, exercise.id, exercise.sets)
            : [];
          const complete = isExerciseComplete(marks);
          return (
            <View key={exercise.id} style={[styles.exercise, complete ? styles.exerciseDone : null]}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.meta}>
                  {exercise.sets} × {exercise.reps}
                </Text>
              </View>
              <SetPips
                marks={marks}
                disabled={Boolean(toast)}
                onToggle={(index) => {
                  void onToggle(exercise, index);
                }}
              />
            </View>
          );
        })}
      </ScrollView>
      <UndoToast visible={Boolean(toast)} onUndo={() => void onUndo()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  back: {
    color: colors.muted,
    fontSize: 14,
  },
  counter: {
    color: colors.brass,
    fontSize: 13,
    fontWeight: '600',
  },
  kicker: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hero: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.6,
    marginTop: 4,
    marginBottom: 20,
  },
  exercise: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  exerciseDone: {
    opacity: 0.45,
  },
  exerciseHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
});
