import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/ThemeContext';

type UndoToastProps = {
  visible: boolean;
  message?: string;
  onUndo: () => void;
};

export function UndoToast({ visible, message = 'Entrenamiento guardado', onUndo }: UndoToastProps) {
  const { colors } = useTheme();
  if (!visible) return null;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.card, borderColor: colors.lastBorder },
      ]}
      accessibilityLiveRegion="polite">
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      <Pressable onPress={onUndo} accessibilityRole="button" accessibilityLabel="Deshacer">
        <Text style={[styles.action, { color: colors.brass }]}>Deshacer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  message: {
    fontSize: 15,
    fontWeight: '600',
  },
  action: {
    fontSize: 15,
    fontWeight: '700',
  },
});
