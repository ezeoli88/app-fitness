import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/ThemeContext';

function SunIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.box}>
      <View style={[iconStyles.sunCore, { borderColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.rayN, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.rayS, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.rayE, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.rayW, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.rayNE, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.rayNW, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.raySE, { backgroundColor: color }]} />
      <View style={[iconStyles.ray, iconStyles.raySW, { backgroundColor: color }]} />
    </View>
  );
}

function MoonIcon({ color, bg }: { color: string; bg: string }) {
  return (
    <View style={[iconStyles.box, iconStyles.moonBox]}>
      <View style={[iconStyles.moon, { backgroundColor: color }]} />
      <View style={[iconStyles.moonCut, { backgroundColor: bg }]} />
    </View>
  );
}

export function ThemeToggle() {
  const { theme, colors, toggleTheme } = useTheme();
  const toLight = theme === 'dark';

  return (
    <Pressable
      onPress={toggleTheme}
      accessibilityRole="button"
      accessibilityLabel={toLight ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      hitSlop={8}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {toLight ? (
        <SunIcon color={colors.brass} />
      ) : (
        <MoonIcon color={colors.brass} bg={colors.card} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const iconStyles = StyleSheet.create({
  box: {
    width: 22,
    height: 22,
  },
  sunCore: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.6,
    left: 7,
    top: 7,
  },
  ray: {
    position: 'absolute',
    width: 1.6,
    height: 3.4,
    borderRadius: 1,
  },
  rayN: { left: 10.2, top: 1 },
  rayS: { left: 10.2, bottom: 1 },
  rayE: { top: 10.2, right: 1, width: 3.4, height: 1.6 },
  rayW: { top: 10.2, left: 1, width: 3.4, height: 1.6 },
  rayNE: { right: 3.4, top: 3.4, transform: [{ rotate: '45deg' }] },
  rayNW: { left: 3.4, top: 3.4, transform: [{ rotate: '-45deg' }] },
  raySE: { right: 3.4, bottom: 3.4, transform: [{ rotate: '-45deg' }] },
  raySW: { left: 3.4, bottom: 3.4, transform: [{ rotate: '45deg' }] },
  moonBox: {
    overflow: 'hidden',
  },
  moon: {
    position: 'absolute',
    width: 15,
    height: 15,
    borderRadius: 8,
    left: 5,
    top: 3.5,
  },
  moonCut: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    left: 2,
    top: 2,
  },
});
