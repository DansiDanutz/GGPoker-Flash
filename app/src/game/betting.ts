// Pure bet-sizing maths for the table action bar. Amounts are "raise to" totals, in table chips.

export type BetContext = {
  /** Everything already in the middle, including bets on the current street. */
  pot: number;
  currentBet: number;
  minRaise: number;
  bb: number;
  myBet: number;
  myStack: number;
  /** Server-computed ceiling (pot-limit games); 0 when the server did not send one. */
  maxRaiseTo: number;
  street: string;
};

export type BetLimits = {
  toCall: number;
  minTo: number;
  maxTo: number;
  allInTo: number;
  canRaise: boolean;
};

export type SizingPreset = { label: string; target: number };

export type PotOdds = { ratio: number; equityNeeded: number };

const PREFLOP_OPEN_MULTIPLES = [2.5, 3, 4];
const POT_FRACTIONS: [string, number][] = [['33%', 1 / 3], ['50%', 0.5], ['75%', 0.75], ['Pot', 1]];

export function betLimits(ctx: BetContext): BetLimits {
  const allInTo = ctx.myBet + ctx.myStack;
  const toCall = Math.min(ctx.myStack, Math.max(0, ctx.currentBet - ctx.myBet));
  const maxTo = ctx.maxRaiseTo > 0 ? Math.min(allInTo, ctx.maxRaiseTo) : allInTo;
  const minTo = Math.min(maxTo, Math.max(ctx.currentBet + ctx.minRaise, ctx.bb));
  return { toCall, minTo, maxTo, allInTo, canRaise: maxTo > ctx.currentBet };
}

function clamp(target: number, limits: BetLimits): number {
  return Math.max(limits.minTo, Math.min(limits.maxTo, target));
}

/** Native shortcut rounding: always up, to a whole multiple of `unit` (minimum 1 chip). */
export function ceilToUnit(target: number, unit: number): number {
  const step = unit >= 1 ? unit : 1;
  return Math.ceil(target / step - 1e-9) * step;
}

/** A pot-fraction raise: call first, then raise by `fraction` of the pot as it stands after the call. */
export function potFractionTarget(ctx: BetContext, fraction: number, step = 1): number {
  const limits = betLimits(ctx);
  const raw = ctx.currentBet + fraction * (ctx.pot + limits.toCall);
  // Pot is its own native path and is never rounded; smaller fractions ceil to the unit.
  return clamp(fraction >= 1 ? Math.round(raw) : ceilToUnit(raw, step), limits);
}

export function sizingPresets(ctx: BetContext, step = 1): SizingPreset[] {
  const limits = betLimits(ctx);
  const isUnopenedPreflop = ctx.street === 'preflop' && ctx.currentBet <= ctx.bb;
  if (isUnopenedPreflop) {
    // The native opening buttons bypass shortcut rounding.
    return PREFLOP_OPEN_MULTIPLES.map((m) => ({ label: `${m}x`, target: clamp(Math.round(ctx.bb * m), limits) }));
  }
  return POT_FRACTIONS.map(([label, fraction]) => ({ label, target: potFractionTarget(ctx, fraction, step) }));
}

/** Price of a call: `ratio` to 1, and the share of the final pot the caller must win to break even. */
export function potOdds(pot: number, toCall: number): PotOdds | null {
  if (toCall <= 0 || pot <= 0) return null;
  return { ratio: pot / toCall, equityNeeded: toCall / (pot + toCall) };
}
