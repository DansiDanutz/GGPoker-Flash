// Table hotkeys grouped like the native Hot Key page (Table actions / Functions / Options),
// with modifier combos and conflict-free reassignment. Ported from the Codex clone's
// hotkey-bindings.mjs: native defaults are F1–F4 and Ctrl+1–4 for the amount presets.

export type HotkeyAction =
  | 'fold' | 'check' | 'raise' | 'allin'
  | 'preset1' | 'preset2' | 'preset3' | 'preset4'
  | 'timebank' | 'sitout' | 'history'
  | 'toggleUnits' | 'showAll';

export type HotkeyGroup = 'Table actions' | 'Functions' | 'Options';
export type HotkeyMap = Readonly<Record<HotkeyAction, string>>;

export const HOTKEY_ACTIONS: ReadonlyArray<{ id: HotkeyAction; label: string; group: HotkeyGroup; key: string }> = [
  { id: 'fold', label: 'Fold', group: 'Table actions', key: 'F1' },
  { id: 'check', label: 'Check / Call', group: 'Table actions', key: 'F2' },
  { id: 'raise', label: 'Bet / Raise', group: 'Table actions', key: 'F3' },
  { id: 'allin', label: 'All-in', group: 'Table actions', key: 'F4' },
  { id: 'preset1', label: 'Select amount 1', group: 'Table actions', key: 'Ctrl+1' },
  { id: 'preset2', label: 'Select amount 2', group: 'Table actions', key: 'Ctrl+2' },
  { id: 'preset3', label: 'Select amount 3', group: 'Table actions', key: 'Ctrl+3' },
  { id: 'preset4', label: 'Select amount 4', group: 'Table actions', key: 'Ctrl+4' },
  { id: 'timebank', label: 'Time bank', group: 'Functions', key: '' },
  { id: 'sitout', label: 'Sit out next hand', group: 'Functions', key: '' },
  { id: 'history', label: 'Hand history', group: 'Functions', key: '' },
  { id: 'toggleUnits', label: 'Switch chip display', group: 'Options', key: '' },
  { id: 'showAll', label: 'Show all cards', group: 'Options', key: '' },
];

export const HOTKEYS_KEY = 'ggpoker.hotkeysMap';
export const DEFAULT_HOTKEYS: HotkeyMap = Object.freeze(
  Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.id, a.key])) as Record<HotkeyAction, string>,
);

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph', 'CapsLock']);
const NAMED = /^(F([1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/;
const COMBO = /^(Ctrl\+)?(Shift\+)?(Alt\+)?(Meta\+)?([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/;

type KeyLike = { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; isComposing?: boolean };

/** `Ctrl+Shift+K`-style name for a key press, or null for bare modifiers and IME input. */
export function comboFromEvent(e: KeyLike): string | null {
  if (e.isComposing || !e.key || MODIFIER_KEYS.has(e.key)) return null;
  let key = e.key === ' ' || e.key === 'Spacebar' ? 'Space' : e.key.replace(/^Arrow/, '');
  if (key.length === 1) key = key.toUpperCase();
  if (!(/^[A-Z0-9]$/.test(key) || NAMED.test(key))) return null;
  return [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.metaKey && 'Meta', key].filter(Boolean).join('+');
}

const isAction = (id: string): id is HotkeyAction => HOTKEY_ACTIONS.some((a) => a.id === id);

/** Saved bindings over the defaults; invalid keys keep their default and later duplicates are cleared. */
export function parseHotkeys(raw: string | null): HotkeyMap {
  let saved: Record<string, unknown> = {};
  try {
    const data = JSON.parse(raw || '{}');
    if (data && typeof data === 'object' && !Array.isArray(data)) saved = data;
  } catch { return DEFAULT_HOTKEYS; }
  const out: Record<string, string> = { ...DEFAULT_HOTKEYS };
  for (const [id, key] of Object.entries(saved)) {
    if (isAction(id) && typeof key === 'string' && (key === '' || COMBO.test(key))) out[id] = key;
  }
  const used = new Set<string>();
  for (const a of HOTKEY_ACTIONS) {
    const key = out[a.id];
    if (!key) continue;
    if (used.has(key)) out[a.id] = '';
    else used.add(key);
  }
  return Object.freeze(out as Record<HotkeyAction, string>);
}

/** Binds `key` to `action`; any other action holding that key becomes unassigned. */
export function assignHotkey(map: HotkeyMap, action: HotkeyAction, key: string): { map: HotkeyMap; displaced: HotkeyAction | null } {
  const holder = key ? HOTKEY_ACTIONS.find((a) => a.id !== action && map[a.id] === key)?.id ?? null : null;
  const next = { ...map, [action]: key, ...(holder ? { [holder]: '' } : {}) };
  return { map: Object.freeze(next), displaced: holder };
}

export function actionForCombo(map: HotkeyMap, combo: string | null): HotkeyAction | null {
  if (!combo) return null;
  return HOTKEY_ACTIONS.find((a) => map[a.id] === combo)?.id ?? null;
}

export function readHotkeys(): HotkeyMap {
  try { return parseHotkeys(localStorage.getItem(HOTKEYS_KEY)); } catch { return DEFAULT_HOTKEYS; }
}

export const hotkeyCaption = (key: string): string => key || 'Unassigned';
