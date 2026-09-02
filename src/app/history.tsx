import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryList } from '@/components/HistoryList';
import { useGym } from '@/db/GymContext';
import type { CompletedSession } from '@/domain/types';
import { colors } from '@/theme';

export default function HistoryScreen() {
  const gym = useGym();
  const router = useRouter();
  const [sessions, setSessions] = useState<CompletedSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      void gym.listCompleted(50).then(setSessions);
    }, [gym])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>← Inicio</Text>
        </Pressable>
        <Text style={styles.hero}>Sesiones</Text>
        <HistoryList sessions={sessions} />
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
    paddingTop: 18,
    paddingBottom: 40,
  },
  back: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 18,
  },
  hero: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.8,
    marginBottom: 18,
  },
});
