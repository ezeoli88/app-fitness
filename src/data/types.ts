import type { GymDb } from '@/db/gymDb';
import type { SettingsStore } from '@/db/settings';

export type AppData = {
  gym: GymDb;
  settings: SettingsStore;
  databaseError: string | null;
  retry: () => void;
};
