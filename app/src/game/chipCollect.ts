// Native street-end chip collection (REA six-seat-chip-motion-verification):
// each live wager slides from its seat anchor into the pot in 400 ms, ease-out cubic.
export const COLLECT_MS = 400;
export const COLLECT_EASING = 'cubic-bezier(.33,1,.68,1)';

type WagerSeat = { seat?: number; bet?: number } | null | undefined;
type WagerSnapshot = { street?: string; players: WagerSeat[] } | null | undefined;

export function collectedWagers(prev: WagerSnapshot, next: WagerSnapshot): { seat: number; amount: number }[] {
  if (!prev || !next || prev.street === next.street) return [];
  return prev.players
    .filter((p): p is { seat: number; bet: number } => !!p && typeof p.seat === 'number' && (p.bet || 0) > 0)
    .map((p) => ({ seat: p.seat, amount: p.bet }));
}
