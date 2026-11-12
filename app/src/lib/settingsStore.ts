// Settings I/O: writes localStorage, tells open windows, and keeps the account copy current.

import { api, getToken } from './api';
import { notifyPrefsChanged } from './prefsSync';
import type { SettingsValues } from './settingsDraft';
import { SETTINGS_UPDATED_AT_KEY, buildSettingsPayload, mergeServerSettings, parseServerSettings } from './settingsSync';

export function readSetting(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(writes: SettingsValues, updatedAt: number): string[] {
  const keys = Object.keys(writes);
  for (const key of keys) {
    const value = writes[key];
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }
  localStorage.setItem(SETTINGS_UPDATED_AT_KEY, String(updatedAt));
  return keys;
}

function localStamp(): number {
  const n = Number(readSetting(SETTINGS_UPDATED_AT_KEY));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Saves settings on this device, updates every open table window, and uploads the account copy
 * when signed in. Resolves once the upload finishes; rejects if the upload fails (the local
 * save has already happened by then).
 */
export async function saveSettings(writes: SettingsValues): Promise<void> {
  const now = Date.now();
  const keys = writeLocal(writes, now);
  notifyPrefsChanged(keys);
  if (!getToken()) return;
  await api.saveSettings(buildSettingsPayload(readSetting, now));
}

/** Merges the account copy from GET /api/me into this device. Returns the keys that changed. */
export function restoreAccountSettings(serverSettings: unknown): string[] {
  try {
    const { writes, updatedAt } = mergeServerSettings(parseServerSettings(serverSettings), { updatedAt: localStamp(), read: readSetting });
    if (!Object.keys(writes).length) return [];
    const keys = writeLocal(writes, updatedAt);
    notifyPrefsChanged(keys);
    return keys;
  } catch (error) {
    // Storage full or blocked: the device keeps its own settings.
    console.warn('Could not restore account settings', error);
    return [];
  }
}
