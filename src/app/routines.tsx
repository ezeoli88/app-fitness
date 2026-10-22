import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLayout } from '@/components/useLayout';
import { confirm } from '@/platform/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGym } from '@/db/GymContext';
import type { Routine } from '@/domain/routine';
import { useTheme } from '@/ThemeContext';

export default function RoutinesScreen() {
  const gym = useGym();
  const router = useRouter();
  const { colors } = useTheme();
  const { maxWidth } = useLayout();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRoutines(await gym.listRoutines(true));
    const active = await gym.getActiveRoutine();
    setActiveId(active?.id ?? null);
  }, [gym]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pick = async (id: string) => {
    try {
      await gym.setActiveRoutine(id);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) {
      confirm({
        title: 'No se pudo cambiar la rutina',
        message: error instanceof Error ? error.message : 'Probá otra vez.',
        actions: [{ text: 'Entendido' }],
      });
    }
  };

  const duplicate = async (routine: Routine) => {
    const id = await gym.duplicateRoutine(routine.id);
    if (id) router.push(`/routine-editor/${id}`);
    else confirm({ title: 'Rutina no disponible', message: 'Actualizá la lista y probá otra vez.', actions: [{ text: 'Entendido' }] });
  };

  const archive = (routine: Routine) => {
    confirm({
      title: 'Archivar rutina',
      message: `«${routine.title}» seguirá apareciendo en el historial.`,
      actions: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: () => void gym.archiveRoutine(routine.id).then(load).catch((error: unknown) =>
            confirm({
              title: 'No se pudo archivar',
              message: error instanceof Error ? error.message : 'Probá otra vez.',
              actions: [{ text: 'Entendido' }],
            })
          ),
        },
      ],
    });
  };

  const available = routines.filter((routine) => !routine.archivedAt);
  const archived = routines.filter((routine) => Boolean(routine.archivedAt));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth, width: '100%', alignSelf: 'center' }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={[styles.back, { color: colors.muted }]}>← Inicio</Text>
        </Pressable>
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <Text style={[styles.hero, { color: colors.text }]}>Rutinas</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>Elegí tu plan o armá uno propio.</Text>
          </View>
          <Pressable
            onPress={() => router.push('/routine-editor/new')}
            accessibilityRole="button"
            style={[styles.add, { backgroundColor: colors.chalk }]}>
            <Text style={[styles.addText, { color: colors.bg }]}>Nueva</Text>
          </Pressable>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>Disponibles</Text>
        {available.map((routine) => {
          const selected = routine.id === activeId;
          return (
            <View
              key={routine.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: selected ? colors.lastBorder : colors.border }]}>
              <Pressable
                onPress={() => void pick(routine.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={styles.pick}>
                <Text style={[styles.level, { color: colors.muted }]}>{routine.level}</Text>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.text }]}>{routine.title}</Text>
                  {selected ? <Text style={[styles.badge, { color: colors.brass }]}>Activa</Text> : null}
                </View>
              </Pressable>
              <View style={[styles.actions, { borderTopColor: colors.border }]}>
                <Pressable onPress={() => router.push(`/routine-editor/${routine.id}`)} accessibilityRole="button">
                  <Text style={[styles.action, { color: colors.brass }]}>Editar</Text>
                </Pressable>
                <Pressable onPress={() => void duplicate(routine)} accessibilityRole="button">
                  <Text style={[styles.action, { color: colors.brass }]}>Duplicar</Text>
                </Pressable>
                <Pressable onPress={() => archive(routine)} accessibilityRole="button" disabled={available.length < 2}>
                  <Text style={[styles.action, { color: available.length < 2 ? colors.muted : colors.brass }]}>Archivar</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {archived.length > 0 ? (
          <>
            <Text style={[styles.section, styles.archivedHeading, { color: colors.muted }]}>Archivadas · conservan el historial</Text>
            {archived.map((routine) => (
              <View key={routine.id} style={[styles.card, styles.archivedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.level, { color: colors.muted }]}>{routine.level}</Text>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.muted }]}>{routine.title}</Text>
                  <Text style={[styles.badge, { color: colors.muted }]}>Archivada</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 50 },
  back: { fontSize: 14, marginBottom: 18 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1 },
  hero: { fontSize: 28, fontWeight: '600', letterSpacing: -0.8 },
  lead: { fontSize: 14, marginTop: 8 },
  add: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 },
  addText: { fontSize: 13, fontWeight: '700' },
  section: { fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', marginTop: 27, marginBottom: 12 },
  archivedHeading: { marginTop: 38 },
  card: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 17, marginBottom: 11 },
  pick: { paddingTop: 14, paddingBottom: 14 },
  level: { fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: '600' },
  badge: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  action: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8 },
  archivedCard: { paddingVertical: 14, opacity: 0.8 },
});
