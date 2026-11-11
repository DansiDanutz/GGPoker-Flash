export type BetValue = number | 'pot' | 'max';
export type BetPrefs = { opening: BetValue[]; normal: BetValue[] };
export const OPENING_CHOICES: BetValue[] = [2, 2.5, 3, 3.5, 4, 4.5, 5, 'pot'];
export const NORMAL_CHOICES: BetValue[] = [33, 50, 66, 75, 80, 90, 100, 'max'];
export const DEFAULT_BETS: BetPrefs = { opening: [2, 3, 4, 'pot'], normal: [33, 50, 75, 100] };
export const CARD_BACKS = [
  { id: 'emerald', label: 'Emerald' },
  { id: 'gold', label: 'Gold' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'sapphire', label: 'Sapphire' },
  { id: 'amethyst', label: 'Amethyst' },
  { id: 'noir', label: 'Noir' },
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
  return (CARD_BACKS.some((b) => b.id === v) ? v : 'emerald') as CardBack;
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
