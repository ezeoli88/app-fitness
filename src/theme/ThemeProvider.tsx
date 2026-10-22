import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { settings } from '@/api/client';
import { nextTheme, palettes, parseThemeName, type ThemeName } from '@/theme';

type ThemeContextValue = {
  theme: ThemeName;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'rutina.device.theme';

function storedTheme(): ThemeName {
  if (typeof localStorage === 'undefined') return 'dark';
  return parseThemeName(localStorage.getItem(STORAGE_KEY));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(storedTheme);

  useEffect(() => {
    void settings.get('theme').then((value) => setTheme(parseThemeName(value))).catch(() => setTheme('dark'));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palettes[theme].bg);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current);
      void settings.set('theme', next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
