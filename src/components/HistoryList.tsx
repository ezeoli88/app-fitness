import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CompletedSession } from '@/domain/types';
import { formatHistoryDate } from '@/format';
import { colors } from '@/theme';

type HistoryListProps = {
  sessions: CompletedSession[];
  emptyLabel?: string;
  showMore?: boolean;
  onPressMore?: () => void;
};

export function HistoryList({
  sessions,
  emptyLabel = 'Todavía no hay sesiones',
  showMore = false,
  onPressMore,
}: HistoryListProps) {
  if (sessions.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View>
      {sessions.map((session, index) => (
        <View
          key={session.id}
          style={[styles.row, index === sessions.length - 1 && !showMore ? styles.rowLast : null]}>
          <Text style={styles.title}>{session.dayTitle}</Text>
          <Text style={styles.date}>
            {session.completedAt ? formatHistoryDate(session.completedAt) : ''}
          </Text>
        </View>
      ))}
      {showMore ? (
        <Pressable onPress={onPressMore} accessibilityRole="button" accessibilityLabel="Ver más">
          <Text style={styles.more}>Ver más</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.muted,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
  },
  date: {
    color: colors.muted,
    fontSize: 14,
  },
  more: {
    color: colors.brass,
    fontSize: 13,
    marginTop: 14,
  },
});
