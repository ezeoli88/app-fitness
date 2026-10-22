import { createContext, useContext, type ReactNode } from 'react';

import { useData } from '@/data/DataProvider';
import type { GymDb } from '@/db/gymDb';

const GymContext = createContext<GymDb | null>(null);

export function GymProvider({ children }: { children: ReactNode }) {
  const { gym } = useData();
  return <GymContext.Provider value={gym}>{children}</GymContext.Provider>;
}

export function useGym(): GymDb {
  const gym = useContext(GymContext);
  if (!gym) throw new Error('useGym must be used within GymProvider');
  return gym;
}
