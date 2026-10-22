import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isSessionExpired, pendingWriteCount, reloadForAccess, subscribeSessionNotice } from '@/data/sessionExpiry';
import { useTheme } from '@/ThemeContext';

export function SessionExpiredBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(isSessionExpired());
  const [pending, setPending] = useState(pendingWriteCount());

  useEffect(() => subscribeSessionNotice(() => {
    setVisible(isSessionExpired());
    setPending(pendingWriteCount());
  }), []);

  if (!visible) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={reloadForAccess}
      style={[styles.banner, { top: Math.max(8, insets.top), backgroundColor: colors.card, borderColor: colors.lastBorder }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        Tu sesión venció. Volver a entrar
        {pending > 0 ? '. Hay cambios que todavía no se guardaron.' : '.'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
});
