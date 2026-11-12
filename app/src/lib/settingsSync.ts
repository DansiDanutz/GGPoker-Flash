// Account-level settings sync. The server stores the JSON blob verbatim (POST /api/me/settings)
// and returns it from GET /api/me. Pure helpers only; settingsStore.ts does the I/O.

import type { SettingsValues } from './settingsDraft';

/** Stamp of the last local settings change, compared with the server copy's stamp. */
export const SETTINGS_UPDATED_AT_KEY = 'ggpoker.settingsUpdatedAt';
export const SETTINGS_PAYLOAD_VERSION = 2;
const MAX_VALUE_LENGTH = 8192;

/** Every preference that follows the account between devices. */
export const SYNCED_SETTING_KEYS: ReadonlyArray<string> = [
  'ggpoker.language', 'ggpoker.animations', 'ggpoker.sound', 'ggpoker.volume',
  'ggpoker.soundChannels', 'ggpoker.soundChannelVolumes',
  'ggpoker.theme', 'ggpoker.cardBack', 'ggpoker.cardFront', 'ggpoker.roomBg', 'ggpoker.fourcolor',
  'ggpoker.automuck', 'ggpoker.rit', 'ggpoker.newWindowTables', 'ggpoker.showHand', 'ggpoker.squeeze',
  'ggpoker.chipShuffle', 'ggpoker.chatBubbles', 'ggpoker.reactions', 'ggpoker.dealSpeed', 'ggpoker.stackMode',
  'ggpoker.hotkeys', 'ggpoker.hotkeyHints', 'ggpoker.hotkeysMap', 'ggpoker.hotkeyGroups',
  'ggpoker.betPrefs', 'ggpoker.bettingOptions',
  'ggpoker.buyinPct', 'ggpoker.autoBuyin', 'ggpoker.autoTopup', 'ggpoker.topupTrigger', 'ggpoker.topupTarget',
];
const SYNCED = new Set(SYNCED_SETTING_KEYS);

/** Short names the first version of the payload used (no timestamp, flat object). */
const LEGACY_NAMES = ['theme', 'volume', 'fourcolor', 'automuck', 'rit', 'betPrefs', 'showHand', 'hotkeyHints', 'dealSpeed', 'cardBack'];

export type SettingsPayload = Readonly<{ version: number; updatedAt: number; values: SettingsValues }>;

export function buildSettingsPayload(read: (key: string) => string | null, updatedAt: number): SettingsPayload {
  return {
    version: SETTINGS_PAYLOAD_VERSION,
    updatedAt,
    values: Object.freeze(Object.fromEntries(SYNCED_SETTING_KEYS.map((k) => [k, read(k)]))),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validValue = (v: unknown): v is string | null => v === null || (typeof v === 'string' && v.length <= MAX_VALUE_LENGTH);

/** Server JSON → validated payload. Unknown keys and bad values are dropped; legacy blobs get stamp 0. */
export function parseServerSettings(raw: unknown): SettingsPayload {
  if (!isRecord(raw)) return { version: 0, updatedAt: 0, values: {} };
  if (isRecord(raw.values)) {
    const values: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw.values)) if (SYNCED.has(k) && validValue(v)) values[k] = v;
    const stamp = Number(raw.updatedAt);
    return { version: Number(raw.version) || 0, updatedAt: Number.isFinite(stamp) && stamp > 0 ? stamp : 0, values };
  }
  const legacy = Object.fromEntries(LEGACY_NAMES
    .filter((name) => typeof raw[name] === 'string' && validValue(raw[name]))
    .map((name) => [`ggpoker.${name}`, raw[name] as string]));
  return { version: 1, updatedAt: 0, values: legacy };
}

/**
 * What to write locally after login. A newer server copy wins key by key; an older (or
 * unstamped) one only fills keys this device has never set.
 */
export function mergeServerSettings(
  server: SettingsPayload,
  local: { updatedAt: number; read: (key: string) => string | null },
): { writes: SettingsValues; updatedAt: number } {
  const serverWins = server.updatedAt > local.updatedAt;
  const writes = Object.entries(server.values).filter(([key, value]) => {
    const mine = local.read(key);
    return serverWins ? mine !== value : mine === null && value !== null;
  });
  return { writes: Object.freeze(Object.fromEntries(writes)), updatedAt: serverWins ? server.updatedAt : local.updatedAt };
}
