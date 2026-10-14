import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SessionSet } from '@/domain/types';
import { useTheme } from '@/ThemeContext';

type SetRecordProps = {
  index: number;
  targetReps: number;
  result: SessionSet;
  weightText: string;
  repsText: string;
  editable: boolean;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onWeightCommit: () => void;
  onRepsCommit: () => void;
  onToggle?: () => void;
};

export function SetRecord({
  index,
  targetReps,
  result,
  weightText,
  repsText,
  editable,
  onWeightChange,
  onRepsChange,
  onWeightCommit,
  onRepsCommit,
  onToggle,
}: SetRecordProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {onToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: result.completed }}
          accessibilityLabel={`Serie ${index + 1}`}
          style={[
            styles.check,
            {
              backgroundColor: result.completed ? colors.chalk : 'transparent',
              borderColor: result.completed ? colors.chalk : colors.border,
            },
          ]}>
          <Text style={[styles.number, { color: result.completed ? colors.bg : colors.text }]}>
            {result.completed ? '✓' : index + 1}
          </Text>
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`Serie ${index + 1}: ${result.completed ? 'Realizada' : 'Pendiente'}`} style={[styles.check, styles.staticCheck, { borderColor: colors.border }]}>
          <Text style={[styles.number, { color: colors.muted }]}>{result.completed ? '✓' : index + 1}</Text>
        </View>
      )}
      <TextInput
        editable={editable}
        value={weightText}
        onChangeText={onWeightChange}
        onBlur={onWeightCommit}
        placeholder={onToggle ? 'kg' : 'Sin dato'}
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        returnKeyType="done"
        accessibilityLabel={`Peso de la serie ${index + 1}, en kilogramos`}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
      />
      <Text style={[styles.separator, { color: colors.muted }]}>×</Text>
      <TextInput
        editable={editable}
        value={repsText}
        onChangeText={onRepsChange}
        onBlur={onRepsCommit}
        placeholder={onToggle ? 'reps' : 'Sin dato'}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        returnKeyType="done"
        accessibilityLabel={`Repeticiones realizadas en la serie ${index + 1}`}
        style={[styles.input, styles.repsInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
      />
      <Text accessibilityLabel={`Objetivo: ${targetReps > 0 ? `${targetReps} repeticiones` : 'Sin dato'}`} style={[styles.target, { color: colors.muted }]}>/{targetReps > 0 ? targetReps : '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  check: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staticCheck: {
    borderWidth: 1,
  },
  number: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minWidth: 65,
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    fontSize: 14,
    textAlign: 'center',
  },
  repsInput: {
    minWidth: 61,
  },
  separator: {
    fontSize: 16,
  },
  target: {
    minWidth: 27,
    fontSize: 13,
  },
});
