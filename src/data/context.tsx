import { createContext, useContext, type ReactNode } from 'react';

import type { AppData } from '@/data/types';

const DataContext = createContext<AppData | null>(null);

export function DataContextProvider({ value, children }: { value: AppData; children: ReactNode }) {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): AppData {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used within DataProvider');
  return value;
}
