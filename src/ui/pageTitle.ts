import { useEffect } from 'react';

export function usePageTitle(title: string): void {
  useEffect(() => {
    if (document.title.includes('Descanso')) return;
    document.title = title;
  }, [title]);
}
