import type { SqlDriver, SqlValue } from '@/db/core/driver';

export const SYNC_SETTING_KEYS = ['activeRoutineId', 'restEnabled', 'restDurationSeconds'] as const;
export const DEVICE_SETTING_KEYS = [
  'theme',
  'activeRestTimer',
  'restPermissionRequested',
  'lastConsumedRestNotification',
] as const;

export type SyncSettingKey = (typeof SYNC_SETTING_KEYS)[number];
export type DeviceSettingKey = (typeof DEVICE_SETTING_KEYS)[number];
export type SettingKey = SyncSettingKey | DeviceSettingKey;

export interface SettingsStore {
  get(key: SettingKey): Promise<string | null>;
  set(key: SettingKey, value: string): Promise<void>;
}

export function isSyncSettingKey(key: string): key is SyncSettingKey {
  return (SYNC_SETTING_KEYS as readonly string[]).includes(key);
}

export function isDeviceSettingKey(key: string): key is DeviceSettingKey {
  return (DEVICE_SETTING_KEYS as readonly string[]).includes(key);
}

export function isSettingKey(key: string): key is SettingKey {
  return isSyncSettingKey(key) || isDeviceSettingKey(key);
}

/** Preferencias en la tabla `settings` (Android y D1). */
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
