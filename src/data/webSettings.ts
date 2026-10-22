import { apiJson, apiSend, enqueueWrite } from '@/data/http';
import { isServerSettingKey, type SettingKey, type SettingsStore } from '@/db/settings';

const STORAGE_PREFIX = 'rutina.device.';

function storage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

/** El tema y el temporizador quedan en el navegador. El resto vive en la API. */
export function createWebSettings(base: string): SettingsStore {
  return {
    async get(key: SettingKey) {
      if (!isServerSettingKey(key)) return storage()?.getItem(`${STORAGE_PREFIX}${key}`) ?? null;
      const response = await apiSend(base, `/settings/${key}`);
      if (!response.ok) return null;
      const body = await response.json() as { value: string | null };
      return body.value ?? null;
    },
    async set(key: SettingKey, value: string) {
      if (!isServerSettingKey(key)) {
        storage()?.setItem(`${STORAGE_PREFIX}${key}`, value);
        return;
      }
      await enqueueWrite(async () => {
        await apiJson(base, `/settings/${key}`, { method: 'PUT', body: { value } });
      });
    },
  };
}
