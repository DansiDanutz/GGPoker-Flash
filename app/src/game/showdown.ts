/**
 * Showdown presentation plan, ported from the reference clone's reveal order:
 * cards turn in seat order over roughly two seconds, then the win badge and
 * pot move follow.
 */
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
