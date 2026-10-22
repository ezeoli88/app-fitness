import { useWindowDimensions } from 'react-native';

export type LayoutMode = 'compact' | 'medium' | 'wide';

export function useLayout() {
  const { width } = useWindowDimensions();
  const mode: LayoutMode = width < 600 ? 'compact' : width < 1024 ? 'medium' : 'wide';
  return {
    mode,
    wide: mode === 'wide',
    width,
    maxWidth: mode === 'wide' ? 1120 : 720,
  };
}
