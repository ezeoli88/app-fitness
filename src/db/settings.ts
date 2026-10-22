import type { SqlDriver, SqlValue } from '@/db/core/driver';

/** Preferencias que viven en D1. El tema y el temporizador activo quedan en el navegador. */
export const SERVER_SETTING_KEYS = ['activeRoutineId', 'restEnabled', 'restDurationSeconds'] as const;
export const DEVICE_SETTING_KEYS = [
  'theme',
  'activeRestTimer',
  'restPermissionRequested',
  'lastConsumedRestNotification',
] as const;

export type ServerSettingKey = (typeof SERVER_SETTING_KEYS)[number];
export type DeviceSettingKey = (typeof DEVICE_SETTING_KEYS)[number];
export type SettingKey = ServerSettingKey | DeviceSettingKey;

export interface SettingsStore {
  get(key: SettingKey): Promise<string | null>;
  set(key: SettingKey, value: string): Promise<void>;
}

export function isServerSettingKey(key: string): key is ServerSettingKey {
  return (SERVER_SETTING_KEYS as readonly string[]).includes(key);
}

export function isDeviceSettingKey(key: string): key is DeviceSettingKey {
  return (DEVICE_SETTING_KEYS as readonly string[]).includes(key);
}

export function isSettingKey(key: string): key is SettingKey {
  return isServerSettingKey(key) || isDeviceSettingKey(key);
}

/** Preferencias en la tabla `settings` de D1. */
export function createSqlSettings(driver: SqlDriver): SettingsStore {
  return {
    async get(key) {
      const row = await driver.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
      return row?.value ?? null;
    },
    async set(key, value) {
      await driver.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
    },
  };
}

export type SettingParam = SqlValue;
