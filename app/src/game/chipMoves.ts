// Add Chips (REA F14) and Remove Chips (REA F15) dialog limits. The server keeps the same
// formulas in server/chip-moves.js; a parity test holds the two together.

export interface AddChipsInput {
  stack: number;
  pending?: number;
  minBuyin: number;
  maxBuyin: number;
  balance: number;
}

export interface ChipRange { min: number; max: number }

const whole = (n: number): number => Math.max(0, Math.floor(Number(n) || 0));

/** max = min(table max − stack − pending, wallet); min = max(table min − stack − pending, 0) clamped to max. */
export function addChipsLimits({ stack, pending = 0, minBuyin, maxBuyin, balance }: AddChipsInput): ChipRange {
  const max = whole(Math.min(maxBuyin - stack - pending, balance));
  const min = Math.min(whole(minBuyin - stack - pending), max);
  return { min, max };
}

/** Only the surplus above the table minimum buy-in can leave the table. */
export function removeChipsLimits({ stack, minBuyin }: { stack: number; minBuyin: number }): ChipRange {
  return { min: 0, max: whole(stack - minBuyin) };
}

export const AUTO_REDUCE_STEP_BB = 10;
export const AUTO_REDUCE_CAP_BB = 200;

/** "Always reduce my stack to N BB": from the table minimum in 10 BB steps up to min(max, 200 BB). */
export function autoReduceOptions({ minBuyin, maxBuyin, bb }: { minBuyin: number; maxBuyin: number; bb: number }): number[] {
  if (!(bb > 0)) return [];
  const first = Math.max(AUTO_REDUCE_STEP_BB, Math.ceil(minBuyin / bb / AUTO_REDUCE_STEP_BB) * AUTO_REDUCE_STEP_BB);
  const last = Math.min(Math.floor(maxBuyin / bb / AUTO_REDUCE_STEP_BB) * AUTO_REDUCE_STEP_BB, AUTO_REDUCE_CAP_BB);
  const out: number[] = [];
  for (let n = first; n <= last; n += AUTO_REDUCE_STEP_BB) out.push(n);
  return out;
}
