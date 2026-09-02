import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayCard } from '@/components/DayCard';
import { HistoryList } from '@/components/HistoryList';
import { useGym } from '@/db/GymContext';
import type { CompletedSession, Day, Exercise, Session } from '@/domain/types';
import {
  countCompletedExercises,
  countCompletedSets,
  totalSets,
} from '@/domain/session';
import { formatTodayHeader } from '@/format';
import { useRecovered } from '@/db/RecoveredContext';
import { colors } from '@/theme';

type DayState = {
  day: Day;
  exercises: Exercise[];
  open: Session | null;
};

export default function HomeScreen() {
  const gym = useGym();
  const router = useRouter();
  const recovered = useRecovered();
  const [days, setDays] = useState<DayState[]>([]);
  const [last, setLast] = useState<CompletedSession | null>(null);
  const [recent, setRecent] = useState<CompletedSession[]>([]);

  const load = useCallback(async () => {
    const listed = await gym.listDays();
    const next: DayState[] = [];
    for (const day of listed) {
      const exercises = await gym.listExercises(day.id);
      const open = await gym.getOpenSession(day.id);
      next.push({ day, exercises, open });
    }
    setDays(next);
    setLast(await gym.lastCompleted());
    setRecent(await gym.listCompleted(3));
  }, [gym]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{formatTodayHeader()}</Text>
        <Text style={styles.hero}>Entrenar</Text>
        {recovered ? (
          <Text style={styles.recovery}>No se pudo leer el progreso. Rutina recargada.</Text>
        ) : null}

        {days.map((item, index) => {
          const doneSets = item.open ? countCompletedSets(item.open.completedSets) : 0;
          const doneExercises = item.open
            ? countCompletedExercises(item.exercises, item.open.completedSets)
            : 0;
          const isLast = last?.dayId === item.day.id && !item.open;

          return (
            <DayCard
              key={item.day.id}
              dayNumber={index + 1}
              title={item.day.title}
              totalExercises={item.exercises.length}
              totalSetsCount={totalSets(item.exercises)}
              doneExercises={doneExercises}
              doneSets={doneSets}
              isOpen={Boolean(item.open)}
              isLast={isLast}
              lastCompletedAt={isLast ? last?.completedAt ?? null : null}
              onPress={() => router.push(`/session/${item.day.id}`)}
            />
          );
        })}

        <Text style={styles.section}>Sesiones</Text>
        <HistoryList
          sessions={recent}
          showMore={recent.length > 0}
          onPressMore={() => router.push('/history')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 40,
  },
  kicker: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  hero: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.8,
    marginTop: 6,
    marginBottom: 22,
  },
  recovery: {
    color: colors.brass,
    fontSize: 13,
    marginBottom: 16,
  },
  section: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 12,
  },
});
