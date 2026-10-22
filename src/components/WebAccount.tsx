import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiBase } from '@/data/http';
import { useTheme } from '@/ThemeContext';

type Me = { email: string; kind: string };

export function WebAccount() {
  const { colors } = useTheme();
  const [email, setEmail] = useState<string | null>(null);
  const local = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    let mounted = true;
    void fetch(`${apiBase()}/me`, { credentials: 'include', redirect: 'manual' })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as Me;
      })
      .then((me) => {
        if (mounted) setEmail(me?.email ?? null);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  if (!email) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.email, { color: colors.muted }]}>{email}</Text>
      {local ? null : (
        <Pressable accessibilityRole="link" onPress={() => { window.location.href = '/cdn-cgi/access/logout'; }}>
          <Text style={[styles.logout, { color: colors.brass }]}>Salir</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, gap: 12 },
  email: { fontSize: 13, flex: 1 },
  logout: { fontSize: 13, fontWeight: '700' },
});
