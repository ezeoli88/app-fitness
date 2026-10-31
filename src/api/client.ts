import { apiBase } from '@/data/http';
import { createHttpDietApi } from '@/data/httpDietApi';
import { createHttpGymDb } from '@/data/httpGymDb';
import { createHttpLabsApi } from '@/data/httpLabsApi';
import { createWebSettings } from '@/data/webSettings';

export const gym = createHttpGymDb(apiBase());
export const settings = createWebSettings(apiBase());
export const diet = createHttpDietApi(apiBase());
export const labs = createHttpLabsApi(apiBase());

let bootstrap: Promise<void> | null = null;

export function ensureBootstrapped(): Promise<void> {
  bootstrap ??= gym.ensureBootstrapped().catch((error: unknown) => {
    bootstrap = null;
    throw error;
  });
  return bootstrap;
}
