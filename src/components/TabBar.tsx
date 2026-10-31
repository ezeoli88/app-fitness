import { Link } from '@tanstack/react-router';

/** Las tres secciones de la app. Solo se muestra en sus pantallas principales. */
export const TAB_PATHS = ['/', '/diet', '/health'] as const;

const TABS = [
  {
    to: '/',
    label: 'Ejercicio',
    icon: <path d="M3 9v4M6 7v8M16 7v8M19 9v4M6 11h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  },
  {
    to: '/diet',
    label: 'Dieta',
    icon: (
      <>
        <circle cx="11" cy="11" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="11" cy="11" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
  {
    to: '/health',
    label: 'Salud',
    icon: <path d="M11 18.5s-7-4.3-7-9.2A3.8 3.8 0 0 1 11 7a3.8 3.8 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  },
] as const;

export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Secciones">
      {TABS.map((tab) => (
        <Link key={tab.to} to={tab.to} className="tab" activeOptions={{ exact: true }} activeProps={{ className: 'active', 'aria-current': 'page' }}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">{tab.icon}</svg>
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
