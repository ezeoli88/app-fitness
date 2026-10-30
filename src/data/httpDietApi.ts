import { apiJson, enqueueWrite } from '@/data/http';
import type { DietSummary, WaistMeasurement } from '@/domain/diet';

/** Lecturas y ajustes de la dieta. Los platos los anota Claude por el conector MCP. */
export function createHttpDietApi(base: string) {
  return {
    summary: (days = 7) => apiJson<DietSummary>(base, `/diet/summary?days=${days}`),
    deleteMeal: (id: number) => enqueueWrite(() => apiJson<{ deleted: boolean }>(base, `/diet/meals/${id}`, { method: 'DELETE' })),
    logWaist: (cm: number) => enqueueWrite(() => apiJson<WaistMeasurement>(base, '/diet/waist', { method: 'POST', body: { cm } })),
    setHeight: (cm: number) => enqueueWrite(() => apiJson<{ ok: true }>(base, '/diet/height', { method: 'PUT', body: { cm } })),
  };
}

export type DietApi = ReturnType<typeof createHttpDietApi>;
