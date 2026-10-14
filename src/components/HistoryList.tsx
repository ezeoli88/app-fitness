import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CompletedSession } from '@/domain/types';
import { formatHistoryDate } from '@/format';
import { useTheme } from '@/ThemeContext';

type HistoryListProps = {
  sessions: CompletedSession[];
  emptyLabel?: string;
  showMore?: boolean;
  onPressMore?: () => void;
  onPressSession?: (session: CompletedSession) => void;
};

export function HistoryList({
  sessions,
  emptyLabel = 'Todavía no hay sesiones',
  showMore = false,
  onPressMore,
  onPressSession,
}: HistoryListProps) {
  const { colors } = useTheme();

  if (sessions.length === 0) {
    return <Text style={[styles.empty, { color: colors.muted }]}>{emptyLabel}</Text>;
  }

  return (
    <View>
      {sessions.map((session, index) => (
        <Pressable
          key={session.id}
          accessibilityRole={onPressSession ? 'button' : undefined}
          accessibilityLabel={`${session.dayTitle}, ${session.completedAt ? formatHistoryDate(session.completedAt) : ''}`}
          disabled={!onPressSession}
          onPress={() => onPressSession?.(session)}
          style={[
            styles.row,
            { borderBottomColor: colors.border },
            index === sessions.length - 1 && !showMore ? styles.rowLast : null,
          ]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>{session.dayTitle}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
              {session.routineTitle} · {session.status === 'partial' ? 'Parcial' : 'Completa'} · {Object.values(session.completedSets).flat().filter(Boolean).length}/{Object.values(session.completedSets).flat().length} series
            </Text>
          </View>
          <Text style={[styles.date, { color: colors.muted }]}>
            {session.completedAt ? formatHistoryDate(session.completedAt) : ''}
          </Text>
        </Pressable>
      ))}
      {showMore ? (
        <Pressable onPress={onPressMore} accessibilityRole="button" accessibilityLabel="Ver más">
          <Text style={[styles.more, { color: colors.brass }]}>Ver más</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  title: {
    fontSize: 14,
  },
  date: {
    fontSize: 14,
  },
  more: {
    fontSize: 13,
    marginTop: 14,
  },
});
