// Pre-actions: a decision queued while waiting for the action to come round.
// "foldany" (Fold to any bet) persists across the streets of the hand: it folds to a bet,
// and when checking is free it checks and stays armed. The others fire once.

export type PreAction =
  | { kind: 'checkfold' }
  | { kind: 'check' }
  | { kind: 'call'; amount: number }
  | { kind: 'foldany' };

export type PreActionMove = 'fold' | 'check' | 'call';

export interface PreActionResult {
  action: PreActionMove | null;
  next: PreAction | null;
}

/** On your turn: the move a queued pre-action makes, and what stays queued afterwards. */
export function resolvePreAction(pre: PreAction | null, toCall: number): PreActionResult {
  if (!pre) return { action: null, next: null };
  const facingBet = toCall > 0;
  switch (pre.kind) {
    case 'foldany':
      return facingBet ? { action: 'fold', next: null } : { action: 'check', next: pre };
    case 'checkfold':
      return { action: facingBet ? 'fold' : 'check', next: null };
    case 'check':
      return { action: facingBet ? null : 'check', next: null };
    case 'call':
      return { action: facingBet && pre.amount === toCall ? 'call' : null, next: null };
    default:
      return { action: null, next: null };
  }
}

/** While waiting: a queued call or check lapses when the price changes; the others hold. */
export function keepPreAction(pre: PreAction | null, toCall: number): PreAction | null {
  if (pre?.kind === 'call' && pre.amount !== toCall) return null;
  if (pre?.kind === 'check' && toCall > 0) return null;
  return pre;
}
