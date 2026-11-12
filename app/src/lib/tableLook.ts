// Per-table appearance overrides (native TableFeltColor/TableBackgroundColor keep a
// per-table map separate from the global Game Settings choice; via the Codex clone).

export const TABLE_THEMES = ['Green', 'Black', 'Red', 'Navy', 'Purple', 'Gray', 'Brown', 'Cobalt', 'Cooper', 'ChocoBrown'] as const;
export const ROOM_BGS = ['featured', '5ring', 'envelope', 'supercircuit', 'mystery', 'plo5envelope', 'plo6super', 'dark', 'floor'] as const;
export const LOOK_KEY = 'ggpoker.tableLook';
const MAX_TABLES = 200;

export type TableLook = { theme: string; roomBg: string };
export type LookOverride = Partial<TableLook>;
export type LookOverrides = Readonly<Record<string, LookOverride>>;

const validTheme = (v: unknown): v is string => typeof v === 'string' && (TABLE_THEMES as readonly string[]).includes(v);
const validBg = (v: unknown): v is string => typeof v === 'string' && (ROOM_BGS as readonly string[]).includes(v);

/** Parses stored overrides, dropping unknown values and malformed entries. */
export function parseLookOverrides(raw: string | null): LookOverrides {
  let data: unknown;
  try { data = JSON.parse(raw || '{}'); } catch { return {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Record<string, LookOverride> = {};
  for (const [id, value] of Object.entries(data as Record<string, unknown>).slice(0, MAX_TABLES)) {
    if (!id || id.length > 64 || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const entry: LookOverride = {};
    if (validTheme(v.theme)) entry.theme = v.theme;
    if (validBg(v.roomBg)) entry.roomBg = v.roomBg;
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
}

/** The look a table shows: its own override first, then the global choice. */
export function resolveLook(global: TableLook, overrides: LookOverrides, tableId: string): TableLook {
  const own = overrides[tableId] || {};
  return { theme: own.theme || global.theme, roomBg: own.roomBg || global.roomBg };
}

/** New overrides with this table's patch applied; `null` removes the table's override. */
export function withLookOverride(overrides: LookOverrides, tableId: string, patch: LookOverride | null): LookOverrides {
  const rest = Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== tableId));
  if (!patch) return rest;
  const merged: LookOverride = { ...overrides[tableId], ...patch };
  const clean: LookOverride = {};
  if (validTheme(merged.theme)) clean.theme = merged.theme;
  if (validBg(merged.roomBg)) clean.roomBg = merged.roomBg;
  return Object.keys(clean).length ? { ...rest, [tableId]: clean } : rest;
}
