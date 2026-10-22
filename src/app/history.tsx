import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryList } from '@/components/HistoryList';
import { SessionDetailView } from '@/components/SessionDetailView';
import { useLayout } from '@/components/useLayout';
import { useGym } from '@/db/GymContext';
import type { CompletedSession } from '@/domain/types';
import type { Routine } from '@/domain/routine';
import { useTheme } from '@/ThemeContext';

const PAGE_SIZE = 20;
const INITIAL_FILTER = '__initial-active__';

export default function HistoryScreen() {
  const gym = useGym();
  const router = useRouter();
  const { colors } = useTheme();
  const { wide, maxWidth } = useLayout();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [filter, setFilter] = useState<string | null | typeof INITIAL_FILTER>(INITIAL_FILTER);
  const [hasMore, setHasMore] = useState(false);
  const request = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [allRoutines, active] = await Promise.all([gym.listRoutineHistory(), gym.getActiveRoutine()]);
      setRoutines(allRoutines);
      const selectedFilter = filter === INITIAL_FILTER ? active?.id ?? null : filter;
      if (filter === INITIAL_FILTER) setFilter(selectedFilter);
      const firstPage = await gym.listCompleted(PAGE_SIZE, 0, selectedFilter);
      if (version !== request.current) return;
      setSessions(firstPage);
      setHasMore(firstPage.length === PAGE_SIZE);
    } catch (reason) {
      if (version === request.current) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el historial.');
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [filter, gym]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const changeFilter = (id: string | null) => { if (id === filter) return; request.current++; setFilter(id); };
  const loadMore = async () => {
    if (loading || !hasMore || filter === INITIAL_FILTER) return;
    const version = ++request.current;
    setLoading(true);
    try {
      const next = await gym.listCompleted(PAGE_SIZE, sessions.length, filter);
      if (version !== request.current) return;
      setSessions((current) => [...current, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (reason) {
      if (version === request.current) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el historial.');
    } finally {
      if (version === request.current) setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={[styles.split, wide ? styles.splitWide : null, { maxWidth, width: '100%', alignSelf: 'center' }]}>
      <ScrollView style={wide ? styles.master : undefined} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={[styles.back, { color: colors.muted }]}>← Inicio</Text>
        </Pressable>
        <Text style={[styles.hero, { color: colors.text }]}>Sesiones</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>Entrenamientos completos y parciales.</Text>

        <View style={styles.filters}>
          <FilterChip title="Todas" selected={filter === null} onPress={() => changeFilter(null)} />
          {routines.map((routine) => (
            <FilterChip
              key={routine.id}
              title={`${routine.title}${routine.archivedAt ? ' · archivada' : ''}`}
              selected={filter === routine.id}
              onPress={() => changeFilter(routine.id)}
            />
          ))}
        </View>

        {error ? <Text accessibilityRole="alert" style={{ color: colors.brass }}>{error}</Text> : null}
        <HistoryList
          sessions={sessions}
          onPressSession={(session) => {
            if (wide) setSelectedId(session.id);
            else router.push(`/session-detail/${session.id}`);
          }}
          emptyLabel={loading ? 'Cargando…' : 'Todavía no hay sesiones guardadas'}
        />
        {hasMore ? (
          <Pressable onPress={() => void loadMore()} disabled={loading} accessibilityRole="button" style={styles.more}>
            <Text style={[styles.moreText, { color: colors.brass }]}>{loading ? 'Cargando…' : 'Cargar más'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {wide ? (
        <View style={[styles.detail, { borderLeftColor: colors.border }]}>
          {selectedId ? (
            <SessionDetailView sessionId={selectedId} embedded />
          ) : (
            <Text style={[styles.lead, { color: colors.muted }]}>Elegí una sesión para ver el detalle.</Text>
          )}
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  );
}

function FilterChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? colors.lastBorder : colors.border, backgroundColor: selected ? colors.card : 'transparent' }]}>
      <Text style={[styles.chipText, { color: selected ? colors.text : colors.muted }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 45 },
  back: { fontSize: 14, marginBottom: 18 },
  hero: { fontSize: 28, fontWeight: '600', letterSpacing: -0.8 },
  lead: { fontSize: 14, marginTop: 7, marginBottom: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12 },
  split: { flex: 1 },
  splitWide: { flexDirection: 'row' },
  master: { flex: 1, maxWidth: 420 },
  detail: { flex: 1, borderLeftWidth: 1 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  chipText: { fontSize: 12, fontWeight: '600' },
  more: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 14, marginTop: 6 },
  moreText: { fontSize: 14, fontWeight: '700' },
});
