import { apiBase } from '@/data/http';
import { createHttpGymDb } from '@/data/httpGymDb';
import { createWebSettings } from '@/data/webSettings';

export const gym = createHttpGymDb(apiBase());
export const settings = createWebSettings(apiBase());

let bootstrap: Promise<void> | null = null;

export function ensureBootstrapped(): Promise<void> {
  bootstrap ??= gym.ensureBootstrapped().catch((error: unknown) => {
    bootstrap = null;
    throw error;
  });
  return bootstrap;
}
