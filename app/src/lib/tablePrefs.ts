export type BetValue = number | 'pot' | 'max';
export type BetPrefs = { opening: BetValue[]; normal: BetValue[] };
export const OPENING_CHOICES: BetValue[] = [2, 2.5, 3, 3.5, 4, 4.5, 5, 'pot'];
export const NORMAL_CHOICES: BetValue[] = [33, 50, 66, 75, 80, 90, 100, 'max'];
export const DEFAULT_BETS: BetPrefs = { opening: [2, 3, 4, 'pot'], normal: [33, 50, 75, 100] };
export const CARD_BACKS = [
  { id: 'red-pattern', label: 'Red pattern' },
  { id: 'blue-pattern', label: 'Blue pattern' },
  { id: 'green-pattern', label: 'Green pattern' },
  { id: 'black-pattern', label: 'Black pattern' },
  { id: 'orange-pattern', label: 'Orange pattern' },
  { id: 'pink-pattern', label: 'Pink pattern' },
  { id: 'gray-pattern', label: 'Gray pattern' },
  { id: 'gg-gray', label: 'GG gray' },
  { id: 'red-plain', label: 'Red plain' },
] as const;
export type CardBack = (typeof CARD_BACKS)[number]['id'];

export function readBetPrefs(): BetPrefs {
  try {
    const p = JSON.parse(localStorage.getItem('ggpoker.betPrefs') || '');
    if (Array.isArray(p?.opening) && p.opening.length === 4 && Array.isArray(p?.normal) && p.normal.length === 4) {
      if (p.opening.every((v: any) => OPENING_CHOICES.includes(v)) && p.normal.every((v: any) => NORMAL_CHOICES.includes(v))) return p;
    }
  } catch { /* use defaults */ }
  return { opening: [...DEFAULT_BETS.opening], normal: [...DEFAULT_BETS.normal] };
}

export function readCardBack(): CardBack {
  const v = localStorage.getItem('ggpoker.cardBack');
  return (CARD_BACKS.some((b) => b.id === v) ? v : 'red-pattern') as CardBack;
}

export function readDealSpeed(): number {
  const n = Number(localStorage.getItem('ggpoker.dealSpeed') || 3);
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 3));
}

export function dealDuration(speed: number): number {
  return [0, .7, .58, .42, .32, .25][Math.max(1, Math.min(5, speed))];
}

export function betLabel(v: BetValue, opening: boolean): string {
  if (v === 'pot') return 'Pot';
  if (v === 'max') return 'Max';
  return opening ? `${v}BB` : `${v}%`;
}

export function betTarget(v: BetValue, opening: boolean, state: { pot: number; currentBet: number; bb: number }, toCall: number, minTo: number, maxTo: number): number {
  let target: number;
  if (v === 'max') target = maxTo;
  else if (opening) {
    target = v === 'pot' ? state.currentBet + state.pot + toCall : Math.round(Number(v) * state.bb);
  } else {
    target = state.currentBet + Math.round((state.pot + toCall) * (v === 'pot' ? 1 : Number(v) / 100));
  }
  return Math.max(minTo, Math.min(maxTo, target));
}


export type StackMode = 'chips' | 'bb' | 'both';
export function readStackMode(): StackMode {
  const v = localStorage.getItem('ggpoker.stackMode');
  return v === 'bb' || v === 'both' ? v : 'chips';
}


export type HotkeyMap = { fold: string; check: string; raise: string; allin: string };
export const DEFAULT_HOTKEYS: HotkeyMap = { fold: 'F1', check: 'F2', raise: 'F3', allin: 'F4' };

export function normalizeHotkey(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function readHotkeys(): HotkeyMap {
  try {
    const raw = JSON.parse(localStorage.getItem('ggpoker.hotkeysMap') || '{}');
    const out = { ...DEFAULT_HOTKEYS };
    for (const k of Object.keys(out) as (keyof HotkeyMap)[]) {
      if (typeof raw[k] === 'string' && raw[k].length <= 12) out[k] = raw[k];
    }
    return out;
  } catch { return { ...DEFAULT_HOTKEYS }; }
}

/** The native "Always confirm" option: ask before chips leave the stack. */
export function readConfirmBet(): boolean {
  return localStorage.getItem('ggpoker.confirmBet') === '1';
}

export type BetRequest = { action: 'raise' | 'allin'; amount: number; confirm: boolean };

/**
 * What one Enter press should do on my turn. The native client documents
 * Enter-to-bet plus an "Always confirm" option, so this returns the action and
 * whether the caller must ask first. Null when there is nothing to bet.
 */
export function enterBetRequest({ myTurn, canRaise, raiseTo, allInTo, confirm = false }: {
  myTurn: boolean;
  canRaise: boolean;
  raiseTo: number;
  allInTo: number;
  confirm?: boolean;
}): BetRequest | null {
  if (!myTurn || !canRaise) return null;
  if (!Number.isFinite(raiseTo) || raiseTo <= 0) return null;
  const amount = Math.round(raiseTo);
  return { action: amount >= allInTo ? 'allin' : 'raise', amount, confirm: !!confirm };
}
