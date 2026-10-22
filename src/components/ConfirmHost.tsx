import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { dismissConfirm, subscribeConfirm } from '@/platform/confirm';
import type { ConfirmRequest } from '@/platform/confirmTypes';
import { useTheme } from '@/ThemeContext';

export function ConfirmHost() {
  const { colors } = useTheme();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribeConfirm(setRequest), []);

  useEffect(() => {
    if (!request || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const cancel = [...request.actions].reverse().find((action) => action.style === 'cancel') ?? request.actions[0];
      dismissConfirm();
      cancel?.onPress?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  const run = (index: number) => {
    const action = request?.actions[index];
    dismissConfirm();
    action?.onPress?.();
  };

  return (
    <Modal visible={Boolean(request)} transparent animationType="fade" onRequestClose={() => run(request?.actions.findIndex((action) => action.style === 'cancel') ?? 0)} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <View accessibilityRole="alert" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{request?.title}</Text>
          {request?.message ? <Text style={[styles.message, { color: colors.muted }]}>{request.message}</Text> : null}
          <View style={styles.actions}>
            {request?.actions.map((action, index) => (
              <Pressable
                key={`${action.text}-${index}`}
                accessibilityRole="button"
                onPress={() => run(index)}
                style={[styles.action, { borderColor: colors.border, backgroundColor: action.style === 'cancel' ? 'transparent' : colors.chalk }]}>
                <Text style={[styles.actionText, { color: action.style === 'destructive' ? '#c23b3b' : action.style === 'cancel' ? colors.text : colors.bg }]}>
                  {action.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  card: { borderWidth: 1, borderRadius: 18, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  actions: { marginTop: 18, gap: 8 },
  action: { borderWidth: 1, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionText: { fontSize: 15, fontWeight: '700' },
});
