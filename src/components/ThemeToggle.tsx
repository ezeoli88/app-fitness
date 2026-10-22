import { useTheme } from '@/theme/ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={toLight ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={toggleTheme}>
      {toLight ? (
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 2.2v2.4M11 17.4v2.4M2.2 11h2.4M17.4 11h2.4M4.6 4.6l1.7 1.7M15.7 15.7l1.7 1.7M17.4 4.6l-1.7 1.7M6.3 15.7l-1.7 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M14.2 3.2a7.2 7.2 0 1 0 4.6 11.6A7.4 7.4 0 0 1 14.2 3.2z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
