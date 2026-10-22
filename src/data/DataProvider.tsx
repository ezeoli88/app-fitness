import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DataContextProvider } from '@/data/context';
import { apiBase } from '@/data/http';
import { createHttpGymDb } from '@/data/httpGymDb';
import type { AppData } from '@/data/types';
import { createWebSettings } from '@/data/webSettings';

export function DataProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const base = apiBase();
  const gym = useMemo(() => createHttpGymDb(base), [base, attempt]);
  const settings = useMemo(() => createWebSettings(base), [base, attempt]);

  useEffect(() => {
    let mounted = true;
    setReady(false);
    gym.ensureBootstrapped()
      .then(() => {
        if (mounted) {
          setDatabaseError(null);
          setReady(true);
        }
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setDatabaseError(error instanceof Error ? error.message : 'No se pudo preparar la base.');
        setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [gym]);

  const retry = useCallback(() => {
    setDatabaseError(null);
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<AppData>(
    () => ({ gym, settings, databaseError, retry }),
    [databaseError, gym, retry, settings]
  );

  if (!ready) return null;
  return <DataContextProvider value={value}>{children}</DataContextProvider>;
}

export { useData } from '@/data/context';
