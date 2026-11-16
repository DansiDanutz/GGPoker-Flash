// Phone cash-table rows: the colour family of each game's tag and the seat-count chip. Free of React so Node can test it.

export type GameTone = 'red' | 'blue' | 'green' | 'violet' | 'amber';

const TONES: Readonly<Record<string, GameTone>> = Object.freeze({
  holdem: 'red',
  omaha: 'blue',
  omaha5: 'green',
  omaha6: 'green',
  shortdeck: 'violet',
  aof: 'amber',
  rush: 'amber',
  rushplo: 'amber',
});

/** Tag colour for a server game id; unknown games share the Hold'em red. */
export function gameTone(game: string): GameTone {
  return TONES[game] || 'red';
}

/** "6-Max", "9-Max", or "Heads-up" for two seats. */
export function maxLabel(seats: number): string {
  const n = Math.floor(Number(seats) || 0);
  if (n === 2) return 'Heads-up';
  return n > 0 ? `${n}-Max` : 'Table';
}

type BuyinLimits = { readonly bb: number; readonly min_buyin: number; readonly max_buyin: number };

/** Slider and stepper increment: half a big blind, never under 100. */
export function buyinStep(t: BuyinLimits): number {
  return Math.max(100, Math.round(t.bb / 2));
}

/** One stepper press: move by a step, staying between the table minimum and what the player can cover. */
export function stepBuyin(t: BuyinLimits, current: number, direction: 1 | -1, balance?: number): number {
  const cap = Math.min(t.max_buyin, Math.max(balance ?? t.min_buyin, t.min_buyin));
  const next = current + direction * buyinStep(t);
  return Math.min(cap, Math.max(t.min_buyin, next));
}
