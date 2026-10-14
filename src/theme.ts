export type ThemeName = 'dark' | 'light';

export type Colors = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  chalk: string;
  brass: string;
  border: string;
  lastBorder: string;
};

export const palettes: Record<ThemeName, Colors> = {
  dark: {
    bg: '#070B12',
    card: '#101826',
    text: '#F3F7FF',
    muted: '#7E90A8',
    chalk: '#FFE14D',
    brass: '#3DFF9A',
    border: '#1C2B3F',
    lastBorder: '#3D9CFF',
  },
  light: {
    bg: '#F3F8FC',
    card: '#FFFFFF',
    text: '#0B1220',
    muted: '#5B6B7A',
    chalk: '#00B85C',
    brass: '#0077FF',
    border: '#D5E2EC',
    lastBorder: '#00C853',
  },
};

export const colors = palettes.dark;

export function parseThemeName(value: string | null | undefined): ThemeName {
  return value === 'light' ? 'light' : 'dark';
}

export function nextTheme(name: ThemeName): ThemeName {
  return name === 'dark' ? 'light' : 'dark';
}
