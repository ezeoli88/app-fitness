import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { WebAccount } from '@/components/WebAccount';
import { useLayout } from '@/components/useLayout';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRestTimer } from '@/db/RestTimerContext';
import { useTheme } from '@/ThemeContext';

const PRESETS = [30, 60, 90, 120, 180, 300];

function durationLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}

export default function RestSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { maxWidth } = useLayout();
  const rest = useRestTimer();
  const web = Platform.OS === 'web';
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setDuration = async (seconds: number) => {
    try {
      await rest.setDurationSeconds(seconds);
      setCustom('');
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cambiar el descanso.');
    }
  };

  const saveCustom = () => {
    const seconds = Number(custom.trim());
    if (!Number.isSafeInteger(seconds) || seconds < 15 || seconds > 600) {
      setError('Elegí entre 15 segundos y 600 segundos.');
      return;
    }
    void setDuration(seconds);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth, width: '100%', alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={[styles.back, { color: colors.muted }]}>← Inicio</Text>
        </Pressable>
        <Text style={[styles.hero, { color: colors.text }]}>Descanso entre series</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>El contador se inicia al marcar una serie cuando quedan otras por completar.</Text>

        <View style={[styles.toggleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.toggleCopy}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Temporizador automático</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Podés extenderlo 30 segundos o saltearlo durante el entrenamiento.</Text>
          </View>
          <Switch
            value={rest.enabled}
            onValueChange={(value) => void rest.setEnabled(value)}
            accessibilityLabel="Activar temporizador de descanso"
            trackColor={{ false: colors.border, true: colors.lastBorder }}
            thumbColor={rest.enabled ? colors.chalk : colors.muted}
          />
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>Duración predeterminada</Text>
        <View style={styles.presets}>
          {PRESETS.map((seconds) => {
            const selected = rest.durationSeconds === seconds;
            return (
              <Pressable
                key={seconds}
                onPress={() => void setDuration(seconds)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.preset, { backgroundColor: selected ? colors.card : 'transparent', borderColor: selected ? colors.lastBorder : colors.border }]}>
                <Text style={[styles.presetText, { color: selected ? colors.text : colors.muted }]}>{durationLabel(seconds)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.current, { color: colors.brass }]}>Ahora: {durationLabel(rest.durationSeconds)}</Text>

        <Text style={[styles.label, { color: colors.muted }]}>Otro tiempo · 15 a 600 segundos</Text>
        <View style={styles.customRow}>
          <TextInput
            value={custom}
            onChangeText={(value) => { setCustom(value.replace(/\D/g, '')); setError(null); }}
            placeholder="Ej.: 90"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            inputMode="numeric"
            accessibilityLabel="Duración personalizada en segundos"
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          />
          <Pressable onPress={saveCustom} accessibilityRole="button" style={[styles.apply, { backgroundColor: colors.chalk }]}>
            <Text style={[styles.applyText, { color: colors.bg }]}>Aplicar</Text>
          </Pressable>
        </View>

        {web ? (
          <Pressable onPress={() => void rest.requestNotificationPermission()} accessibilityRole="button" style={[styles.apply, styles.enable, { backgroundColor: colors.chalk }]}>
            <Text style={[styles.applyText, { color: colors.bg }]}>Activar avisos</Text>
          </Pressable>
        ) : null}
        {rest.permissionMessage ? (
          <View style={[styles.permissionCard, { borderColor: colors.border }]}>
            <Text style={[styles.permission, { color: colors.muted }]}>{rest.permissionMessage}</Text>
            {!web && rest.notificationsAllowed === false ? (
              <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
                <Text style={[styles.settingsLink, { color: colors.brass }]}>Abrir ajustes del dispositivo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.note, styles.permissionHint, { color: colors.muted }]}>
            {web
              ? 'En el navegador el aviso suena en esta pestaña. Si la dejás en segundo plano puede atrasarse, y si cerrás el navegador no hay aviso.'
              : rest.notificationsAllowed
                ? 'Los avisos están habilitados para cuando cambiás de app o bloqueás la pantalla.'
                : 'Al iniciar el primer descanso te pediremos permiso para enviarte avisos. Podés habilitarlos en los ajustes del dispositivo.'}
          </Text>
        )}
        <WebAccount />
        {rest.activeTimer ? (
          <Pressable onPress={() => void rest.skipRest()} accessibilityRole="button" style={styles.skip}>
            <Text style={[styles.settingsLink, { color: colors.brass }]}>Omitir el descanso actual</Text>
          </Pressable>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.brass }]}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 44 },
  back: { fontSize: 14, marginBottom: 19 },
  hero: { fontSize: 25, fontWeight: '600', letterSpacing: -0.6 },
  lead: { fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  toggleCard: { borderWidth: 1, borderRadius: 17, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleCopy: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  section: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 28, marginBottom: 13 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  preset: { minWidth: '29%', borderRadius: 13, borderWidth: 1, alignItems: 'center', paddingVertical: 12 },
  presetText: { fontSize: 13, fontWeight: '600' },
  current: { fontSize: 13, fontWeight: '600', marginTop: 15 },
  label: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 15 },
  apply: { borderRadius: 11, paddingVertical: 13, paddingHorizontal: 17 },
  enable: { alignSelf: 'flex-start', marginTop: 22 },
  applyText: { fontSize: 14, fontWeight: '700' },
  permissionCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 24 },
  permission: { fontSize: 13, lineHeight: 19 },
  settingsLink: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  permissionHint: { marginTop: 22 },
  skip: { marginTop: 8, alignSelf: 'flex-start' },
  error: { fontSize: 13, marginTop: 14 },
});
