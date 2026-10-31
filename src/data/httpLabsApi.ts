import { apiJson, enqueueWrite } from '@/data/http';
import type { LabReport } from '@/domain/labs';

/** Lecturas de los análisis de sangre. Los estudios los guarda Claude por el conector MCP. */
export function createHttpLabsApi(base: string) {
  return {
    list: () => apiJson<{ reports: LabReport[] }>(base, '/labs'),
    deleteReport: (id: number) => enqueueWrite(() => apiJson<{ deleted: boolean }>(base, `/labs/${id}`, { method: 'DELETE' })),
  };
}

export type LabsApi = ReturnType<typeof createHttpLabsApi>;
