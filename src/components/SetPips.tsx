import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type SetPipsProps = {
  marks: boolean[];
  disabled?: boolean;
  onToggle: (index: number) => void;
};

export function SetPips({ marks, disabled = false, onToggle }: SetPipsProps) {
  return (
    <View style={styles.row}>
      {marks.map((done, index) => (
        <Pressable
          key={index}
          disabled={disabled}
          onPress={() => onToggle(index)}
          accessibilityRole="button"
          accessibilityState={{ checked: done, disabled }}
          accessibilityLabel={`Serie ${index + 1}`}
          style={[styles.pip, done ? styles.pipDone : styles.pipEmpty]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  pip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  pipEmpty: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  pipDone: {
    borderColor: colors.chalk,
    backgroundColor: colors.chalk,
  },
});
