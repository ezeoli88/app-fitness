import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayCard } from '@/components/DayCard';
import { HistoryList } from '@/components/HistoryList';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useLayout } from '@/components/useLayout';
import { useGym } from '@/db/GymContext';
import { countCompletedExercises, countCompletedSets, totalSets } from '@/domain/session';
import { nextTrainingDay, type Routine } from '@/domain/routine';
import type { CompletedSession, Day, Exercise, Session } from '@/domain/types';
import { formatTodayHeader } from '@/format';
import { useTheme } from '@/ThemeContext';

type DayState = { day: Day; exercises: Exercise[]; open: Session | null };

export default function HomeScreen() {
  const gym = useGym();
  const router = useRouter();
  const { colors } = useTheme();
  const { wide, maxWidth } = useLayout();
  const [days, setDays] = useState<DayState[]>([]);
  const [last, setLast] = useState<CompletedSession | null>(null);
  const [recent, setRecent] = useState<CompletedSession[]>([]);
  const [openSessions, setOpenSessions] = useState<Session[]>([]);
  const [routine, setRoutine] = useState<Routine | null>(null);

  const load = useCallback(async () => {
    const home = await gym.getHomeSnapshot();
    setDays(home.days);
    setLast(home.lastCompleted);
    setRecent(home.recent);
    setOpenSessions(home.openSessions);
    setRoutine(home.routine);
  }, [gym]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const nextDay = nextTrainingDay(days.map((item) => item.day), last?.dayId ?? null);
  const resumableSession = openSessions[0];
  const visibleOpenIds = new Set(days.filter((item) => item.open).map((item) => item.open!.id));
  const archivedDaySession = openSessions.find((item) => !visibleOpenIds.has(item.id));

  const dayCards = days.map((item, index) => {
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
        isNext={nextDay?.id === item.day.id}
        lastCompletedAt={isLast ? last?.completedAt ?? null : null}
        onPress={() => router.push(`/session/${item.day.id}`)}
      />
    );
  });

  const resumeCard = resumableSession ? (
    <Pressable
      onPress={() => router.push(`/session/${resumableSession.dayId}`)}
      accessibilityRole="button"
      style={[styles.resume, { backgroundColor: colors.card, borderColor: colors.lastBorder }]}>
      <View style={styles.resumeCopy}>
        <Text style={[styles.resumeKicker, { color: colors.brass }]}>CONTINUAR ENTRENAMIENTO</Text>
        <Text style={[styles.resumeTitle, { color: colors.text }]}>{resumableSession.dayTitle}</Text>
        <Text style={[styles.resumeSubtitle, { color: colors.muted }]}>{resumableSession.routineTitle}</Text>
      </View>
      <Text style={[styles.arrow, { color: colors.brass }]}>→</Text>
    </Pressable>
  ) : null;

  const archivedCard = archivedDaySession ? (
    <Pressable
      onPress={() => router.push(`/session/${archivedDaySession.dayId}`)}
      accessibilityRole="button"
      style={[styles.archivedOpen, { borderColor: colors.border }]}>
      <Text style={[styles.archivedOpenText, { color: colors.brass }]}>
        También podés continuar «{archivedDaySession.dayTitle}» de «{archivedDaySession.routineTitle}».
      </Text>
    </Pressable>
  ) : null;

  const historyBlock = (
    <>
      <View style={styles.historyHeading}>
        <Text style={[styles.section, { color: colors.muted }]}>Sesiones</Text>
        {recent.length > 0 ? (
          <Pressable onPress={() => router.push('/history')} accessibilityRole="button">
            <Text style={[styles.historyLink, { color: colors.brass }]}>Ver historial</Text>
          </Pressable>
        ) : null}
      </View>
      <HistoryList
        sessions={recent}
        onPressSession={(session) => router.push(`/session-detail/${session.id}`)}
      />
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth, width: '100%', alignSelf: 'center' }]}>
        <View style={styles.top}>
          <View style={styles.titles}>
            <Text style={[styles.kicker, { color: colors.muted }]}>{formatTodayHeader()}</Text>
            <Text style={[styles.hero, { color: colors.text }]}>Entrenar</Text>
            <Pressable onPress={() => router.push('/routines')} accessibilityRole="button">
              <Text style={[styles.routine, { color: colors.brass }]}>
                {routine?.title ?? 'Elegir rutina'}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push('/rest-settings')} accessibilityRole="button">
              <Text style={[styles.restLink, { color: colors.muted }]}>Descanso y temporizador</Text>
            </Pressable>
          </View>
          <ThemeToggle />
        </View>

        {wide ? (
          <View style={styles.columns}>
            <View style={styles.column}>{dayCards}</View>
            <View style={styles.column}>
              {resumeCard}
              {archivedCard}
              {historyBlock}
            </View>
          </View>
        ) : (
          <>
            {resumeCard}
            {archivedCard}
            {dayCards}
            {historyBlock}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12 },
  titles: { flex: 1 },
  kicker: { fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase' },
  hero: { fontSize: 28, fontWeight: '600', letterSpacing: -0.8, marginTop: 6 },
  routine: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  restLink: { fontSize: 12, marginTop: 8 },
  resume: { flexDirection: 'row', alignItems: 'center', padding: 18, borderWidth: 1, borderRadius: 18, marginBottom: 12 },
  resumeCopy: { flex: 1 },
  resumeKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  resumeTitle: { fontSize: 18, fontWeight: '600', marginTop: 7 },
  resumeSubtitle: { fontSize: 12, marginTop: 4 },
  arrow: { fontSize: 24, paddingLeft: 12 },
  archivedOpen: { borderWidth: 1, borderRadius: 13, padding: 13, marginBottom: 12 },
  archivedOpenText: { fontSize: 13, lineHeight: 18 },
  historyHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 12 },
  section: { fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase' },
  historyLink: { fontSize: 13, fontWeight: '600' },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  column: { flex: 1, minWidth: 0 },
});
