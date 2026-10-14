import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getSetting, setSetting } from '@/db/settings';
import { nextTheme, palettes, parseThemeName, type Colors, type ThemeName } from '@/theme';

type ThemeContextValue = {
  theme: ThemeName;
  colors: Colors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [theme, setTheme] = useState<ThemeName>('dark');

  useEffect(() => {
    void getSetting(db, 'theme').then((value) => {
      setTheme(parseThemeName(value));
    }).catch(() => setTheme('dark'));
  }, [db]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current);
      void setSetting(db, 'theme', next);
      return next;
    });
  }, [db]);

  const value = useMemo(
    () => ({
      theme,
      colors: palettes[theme],
      toggleTheme,
    }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value;
}
