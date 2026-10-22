import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCompletedLong } from '@/format';
import { useTheme } from '@/ThemeContext';

type DayCardProps = {
  dayNumber: number;
  title: string;
  totalExercises: number;
  totalSetsCount: number;
  doneExercises: number;
  doneSets: number;
  isOpen: boolean;
  isLast: boolean;
  isNext?: boolean;
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
  isNext = false,
  lastCompletedAt,
  onPress,
}: DayCardProps) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const progress = totalSetsCount === 0 ? 0 : doneSets / totalSetsCount;

  let subtitle = `${totalExercises} ejercicios · ${totalSetsCount} series`;
  if (isOpen) {
    subtitle = `${doneExercises} / ${totalExercises} ejercicios · ${doneSets} / ${totalSetsCount} series`;
  } else if (isLast && lastCompletedAt) {
    subtitle = `Finalizada el ${formatCompletedLong(lastCompletedAt)}`;
  }

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: hovered || (isLast && !isOpen) ? colors.lastBorder : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={[styles.kicker, { color: colors.muted }]}>Día {dayNumber}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        </View>
        {isOpen ? <Text style={[styles.badge, { color: colors.brass }]}>A medias</Text> : null}
        {isLast && !isOpen ? (
          <Text style={[styles.badgeLast, { color: colors.brass }]}>Última</Text>
        ) : null}
        {isNext && !isOpen && !isLast ? (
          <Text style={[styles.badgeLast, { color: colors.brass }]}>Próximo</Text>
        ) : null}
      </View>
      {isOpen ? (
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.chalk }]} />
        </View>
      ) : null}
      <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
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
    fontSize: 11,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: -0.4,
  },
  badge: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeLast: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  track: {
    height: 3,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 14,
  },
  fill: {
    height: '100%',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 10,
  },
});
