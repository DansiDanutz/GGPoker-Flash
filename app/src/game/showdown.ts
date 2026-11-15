/**
 * Showdown presentation plan, ported from the reference clone's reveal order:
 * cards turn in seat order over roughly two seconds, then the win badge and
 * pot move follow.
 */
/** How long the hero's WIN banner stays up after the pot moves. */
export const WIN_BANNER_MS = 2600;

export type ShowdownReveal = { seat: number; at: number };

export function showdownPlan(seats: number[], firstSeat?: number | null): ShowdownReveal[] {
  const sorted = [...new Set(seats.filter((s) => Number.isInteger(s) && s >= 0))].sort((a, b) => a - b);
  // Clockwise from the first seat to show (the last aggressor, set by the server).
  const start = firstSeat == null ? 0 : Math.max(0, sorted.findIndex((s) => s >= firstSeat));
  const ordered = [...sorted.slice(start), ...sorted.slice(0, start)];
  const n = Math.max(1, ordered.length);
  return ordered.map((seat, i) => ({ seat, at: 400 + Math.round((2000 / n) * (i + 1)) }));
}

/** Milliseconds after the win event until the reveal completes. */
export function showdownComplete(seats: number[]): number {
  const plan = showdownPlan(seats);
  return plan.length ? plan[plan.length - 1].at + 300 : 0;
}

/** The hero's hand-strength label is shown only while the hero is dealt in and has not folded. */
export function heroHoldsHand(me: { inHand?: boolean; folded?: boolean } | null | undefined): boolean {
  return !!me?.inHand && !me.folded;
}

/** One payout to the hero as the server reports it. */
export type HeroPayout = Readonly<{ amount?: number; contested?: boolean; invested?: number }>;

/**
 * Whether the hero really won: a pot someone else could also have won (a side pot counts),
 * or more back than they put in. Their own unmatched all-in layer coming back is not a win.
 * Payouts from a server without these fields count as wins, as before.
 */
export function heroWon(mine: readonly HeroPayout[]): boolean {
  if (!mine.length) return false;
  if (mine.some((m) => m.contested !== false)) return true;
  const total = mine.reduce((a, m) => a + (m.amount || 0), 0);
  const invested = Math.max(0, ...mine.map((m) => m.invested ?? 0));
  return total > invested;
}

