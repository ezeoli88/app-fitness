import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

type UndoToastProps = {
  visible: boolean;
  onUndo: () => void;
};

export function UndoToast({ visible, onUndo }: UndoToastProps) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={styles.message}>Día completo</Text>
      <Pressable onPress={onUndo} accessibilityRole="button" accessibilityLabel="Deshacer">
        <Text style={styles.action}>Deshacer</Text>
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
    backgroundColor: colors.card,
    borderColor: colors.lastBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  message: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  action: {
    color: colors.brass,
    fontSize: 15,
    fontWeight: '700',
  },
});
