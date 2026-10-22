import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createContext } from 'react';

import { useData } from '@/data/DataProvider';
import { nextTheme, palettes, parseThemeName, type Colors, type ThemeName } from '@/theme';

type ThemeContextValue = {
  theme: ThemeName;
  colors: Colors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const [theme, setTheme] = useState<ThemeName>('dark');

  useEffect(() => {
    void settings.get('theme').then((value) => {
      setTheme(parseThemeName(value));
    }).catch(() => setTheme('dark'));
  }, [settings]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current);
      void settings.set('theme', next);
      return next;
    });
  }, [settings]);

  const value = useMemo(
    () => ({ theme, colors: palettes[theme], toggleTheme }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
