import { createContext, useContext } from 'react';

export const RecoveredContext = createContext(false);

export function useRecovered() {
  return useContext(RecoveredContext);
}
