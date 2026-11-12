// Table hotkeys grouped like the native Hot Key page (Table actions / Functions / Options),
// with modifier combos and conflict-free reassignment. Ported from the Codex clone's
// hotkey-bindings.mjs: native defaults are F1–F4 and Ctrl+1–4 for the amount presets.

export type HotkeyAction =
  | 'fold' | 'check' | 'raise' | 'allin'
  | 'preset1' | 'preset2' | 'preset3' | 'preset4'
  | 'timebank' | 'sitout' | 'history' | 'addChips'
  | 'toggleUnits' | 'showAll' | 'showLeft' | 'showRight';

export type HotkeyGroup = 'Table actions' | 'Bet sizing' | 'Functions' | 'Options';
export type HotkeyMap = Readonly<Record<HotkeyAction, string>>;

export const HOTKEY_ACTIONS: ReadonlyArray<{ id: HotkeyAction; label: string; group: HotkeyGroup; key: string }> = [
  { id: 'fold', label: 'Fold', group: 'Table actions', key: 'F1' },
  { id: 'check', label: 'Check / Call', group: 'Table actions', key: 'F2' },
  { id: 'raise', label: 'Bet / Raise', group: 'Table actions', key: 'F3' },
  { id: 'allin', label: 'All-in', group: 'Table actions', key: 'F4' },
  { id: 'preset1', label: 'Select amount 1', group: 'Bet sizing', key: 'Ctrl+1' },
  { id: 'preset2', label: 'Select amount 2', group: 'Bet sizing', key: 'Ctrl+2' },
  { id: 'preset3', label: 'Select amount 3', group: 'Bet sizing', key: 'Ctrl+3' },
  { id: 'preset4', label: 'Select amount 4', group: 'Bet sizing', key: 'Ctrl+4' },
  { id: 'timebank', label: 'Time bank', group: 'Functions', key: '' },
  { id: 'sitout', label: 'Sit out next hand', group: 'Functions', key: '' },
  { id: 'history', label: 'Hand history', group: 'Functions', key: '' },
  { id: 'addChips', label: 'Add chips', group: 'Functions', key: '' },
  { id: 'toggleUnits', label: 'Switch chip display', group: 'Options', key: '' },
  { id: 'showAll', label: 'Show all cards', group: 'Options', key: '' },
  { id: 'showLeft', label: 'Show left card', group: 'Options', key: '' },
  { id: 'showRight', label: 'Show right card', group: 'Options', key: '' },
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

// ---- master switch and per-group switches ----

export const HOTKEY_GROUPS: ReadonlyArray<HotkeyGroup> = ['Table actions', 'Bet sizing', 'Functions', 'Options'];
/** '0' turns every table hotkey off; anything else (or nothing saved) leaves them on. */
export const HOTKEYS_ENABLED_KEY = 'ggpoker.hotkeys';
export const HOTKEY_GROUPS_KEY = 'ggpoker.hotkeyGroups';
/** Every storage key whose change should re-read hotkey preferences in open tables. */
export const HOTKEY_PREF_KEYS: ReadonlyArray<string> = [HOTKEYS_KEY, HOTKEYS_ENABLED_KEY, HOTKEY_GROUPS_KEY];

export type HotkeyGroupSwitches = Readonly<Record<HotkeyGroup, boolean>>;
export type HotkeyPrefs = Readonly<{ enabled: boolean; groups: HotkeyGroupSwitches }>;

export const DEFAULT_HOTKEY_GROUPS: HotkeyGroupSwitches = Object.freeze(
  Object.fromEntries(HOTKEY_GROUPS.map((g) => [g, true])) as Record<HotkeyGroup, boolean>,
);

/** Saved group switches over the defaults (all on); unknown groups and non-boolean values are ignored. */
export function parseHotkeyGroups(raw: string | null): HotkeyGroupSwitches {
  let saved: Record<string, unknown> = {};
  try {
    const data = JSON.parse(raw || '{}');
    if (data && typeof data === 'object' && !Array.isArray(data)) saved = data;
  } catch { return DEFAULT_HOTKEY_GROUPS; }
  const out: Record<string, boolean> = { ...DEFAULT_HOTKEY_GROUPS };
  for (const g of HOTKEY_GROUPS) if (typeof saved[g] === 'boolean') out[g] = saved[g] as boolean;
  return Object.freeze(out as Record<HotkeyGroup, boolean>);
}

export function parseHotkeyPrefs(enabledRaw: string | null, groupsRaw: string | null): HotkeyPrefs {
  return Object.freeze({ enabled: enabledRaw !== '0', groups: parseHotkeyGroups(groupsRaw) });
}

export function readHotkeyPrefs(): HotkeyPrefs {
  try { return parseHotkeyPrefs(localStorage.getItem(HOTKEYS_ENABLED_KEY), localStorage.getItem(HOTKEY_GROUPS_KEY)); }
  catch { return parseHotkeyPrefs(null, null); }
}

export const groupOf = (action: HotkeyAction): HotkeyGroup =>
  HOTKEY_ACTIONS.find((a) => a.id === action)?.group ?? 'Table actions';

/** The action a key press triggers, honouring the master switch and the action's group switch. */
export function resolveHotkey(map: HotkeyMap, prefs: HotkeyPrefs, combo: string | null): HotkeyAction | null {
  if (!prefs.enabled) return null;
  const action = actionForCombo(map, combo);
  return action && prefs.groups[groupOf(action)] ? action : null;
}

/** Card indices for the show-one-card hotkeys: left is the first hole card, right the last. */
export function showCardIndices(action: 'showLeft' | 'showRight', cardCount: number): number[] {
  if (cardCount < 1) return [];
  return [action === 'showLeft' ? 0 : cardCount - 1];
}
