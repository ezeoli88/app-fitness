import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCompletedLong } from '@/format';
import { colors } from '@/theme';

type DayCardProps = {
  dayNumber: number;
  title: string;
  totalExercises: number;
  totalSetsCount: number;
  doneExercises: number;
  doneSets: number;
  isOpen: boolean;
  isLast: boolean;
  lastCompletedAt: string | null;
  onPress: () => void;
};

export function DayCard({
  dayNumber,
  title,
  totalExercises,
  totalSetsCount,
  doneExercises,
  doneSets,
  isOpen,
  isLast,
  lastCompletedAt,
  onPress,
}: DayCardProps) {
  const progress = totalSetsCount === 0 ? 0 : doneSets / totalSetsCount;

  let subtitle = `${totalExercises} ejercicios · ${totalSetsCount} series`;
  if (isOpen) {
    subtitle = `${doneExercises} / ${totalExercises} ejercicios · ${doneSets} / ${totalSetsCount} series`;
  } else if (isLast && lastCompletedAt) {
    subtitle = `Completada el ${formatCompletedLong(lastCompletedAt)}`;
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, isLast && !isOpen ? styles.cardLast : null]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={styles.kicker}>Día {dayNumber}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {isOpen ? <Text style={styles.badge}>A medias</Text> : null}
        {isLast && !isOpen ? <Text style={styles.badgeLast}>Última</Text> : null}
      </View>
      {isOpen ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
  },
  cardLast: {
    borderColor: colors.lastBorder,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  titles: {
    flex: 1,
  },
  kicker: {
    color: colors.muted,
    fontSize: 11,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: -0.4,
  },
  badge: {
    color: colors.brass,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeLast: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  track: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 14,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.chalk,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 10,
  },
});
