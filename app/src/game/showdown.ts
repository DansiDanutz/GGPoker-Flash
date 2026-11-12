/**
 * Showdown presentation plan, ported from the reference clone's reveal order:
 * cards turn in seat order over roughly two seconds, then the win badge and
 * pot move follow.
 */
export type ShowdownReveal = { seat: number; at: number };

export function showdownPlan(seats: number[]): ShowdownReveal[] {
  const ordered = [...new Set(seats.filter((s) => Number.isInteger(s) && s >= 0))].sort((a, b) => a - b);
  const n = Math.max(1, ordered.length);
  return ordered.map((seat, i) => ({ seat, at: 400 + Math.round((2000 / n) * (i + 1)) }));
}

/** Milliseconds after the win event until the reveal completes. */
export function showdownComplete(seats: number[]): number {
  const plan = showdownPlan(seats);
  return plan.length ? plan[plan.length - 1].at + 300 : 0;
}
