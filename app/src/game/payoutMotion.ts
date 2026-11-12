// Native per-pot payout motion (REA per-pot-awards.json: TableSetting.potPositions,
// PotView3D.refreshPosition, MotionView3D.potMoveToWinners).
export const PAYOUT_TRANSFER_MS = 400;
export const PAYOUT_HOLD_MS = 1200;
export const PAYOUT_FADE_MS = 400;
export const PAYOUT_EASING = 'cubic-bezier(.33,1,.68,1)';
/** Native stop distance before the winning cell: 140 x player scale (desktop scale 1). */
export const PAYOUT_STOP_PX = 140;
/** Native table design width the pot positions are expressed in. */
export const NATIVE_TABLE_WIDTH = 1700;

const POT_ORIGINS: [number, number][] = [
  [850, 663], [692, 706], [1008, 706], [850, 760], [544, 776],
  [1156, 776], [700, 825], [1000, 825], [544, 872], [1156, 872],
];

export type PayoutShare = { seat: number; amount: number; potIndex: number };

/** One share per pot and winner, main pot first; fold wins belong to pot 0. */
export function payoutShares(winners: { seat?: number; amount?: number; potIndex?: number }[]): PayoutShare[] {
  return winners
    .filter((w) => typeof w.seat === 'number' && (w.amount || 0) > 0)
    .map((w) => ({ seat: w.seat as number, amount: w.amount as number, potIndex: w.potIndex ?? 0 }))
    .sort((a, b) => a.potIndex - b.potIndex);
}

/** Pixel offset of a pot from the main pot, scaled from the native table width. */
export function potOffset(potIndex: number, tableWidthPx: number): [number, number] {
  const origin = POT_ORIGINS[potIndex];
  if (!origin) return [0, 0];
  const scale = tableWidthPx / NATIVE_TABLE_WIDTH;
  return [(origin[0] - POT_ORIGINS[0][0]) * scale, (origin[1] - POT_ORIGINS[0][1]) * scale];
}

/** The point `stop` pixels before `to` on the line from `from`. */
export function stopShort(from: [number, number], to: [number, number], stop: number): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len <= stop) return [from[0], from[1]];
  const k = (len - stop) / len;
  return [from[0] + dx * k, from[1] + dy * k];
}
