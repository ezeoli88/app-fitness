import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { createGymDb, type GymDb } from '@/db/gymDb';

const GymContext = createContext<GymDb | null>(null);

export function GymProvider({ children }: { children: ReactNode }) {
  const sqlite = useSQLiteContext();
  const gym = useMemo(() => createGymDb(sqlite), [sqlite]);
  return <GymContext.Provider value={gym}>{children}</GymContext.Provider>;
}

export function useGym(): GymDb {
  const gym = useContext(GymContext);
  if (!gym) {
    throw new Error('useGym must be used within GymProvider');
  }
  return gym;
}
