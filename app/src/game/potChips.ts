/**
 * Table chip visuals, ported from the reference clone's `playChipLayout`.
 *
 * The pot is decomposed into native-style denominations (1, 5, 25 and 100 big
 * blinds), one column per denomination, at most nine chips per column. The
 * label still carries the exact amount; the pile is the visual scale.
 */
export type PotChipColumn = { denom: number; count: number };

const POT_DENOMS = [100, 25, 5, 1];
const COLUMN_CAP = 9;

export function potChipLayout(pot: number, bb: number, cap: number = COLUMN_CAP): PotChipColumn[] {
  const value = Math.max(0, Number(pot) || 0);
  if (value <= 0) return [];
  const unit = Math.max(1, Number(bb) || 1);
  let remaining = Math.max(1, Math.round(value / unit));
  const columns: PotChipColumn[] = [];
  for (const denom of POT_DENOMS) {
    let count = 0;
    while (remaining >= denom && count < cap) {
      count += 1;
      remaining -= denom;
    }
    if (count) columns.push({ denom, count });
  }
  // Small chips left, big chips right, like the native groups.
  return columns.reverse();
}

/** The chip shuffle sprite is a 16×16 sheet; frame 1 starts at the top-left. */
export const SHUFFLE_START_FRAME = 37;
export const SHUFFLE_END_FRAME = 245;

export function shuffleFramePosition(frame: number): { x: number; y: number } {
  const index = Math.max(0, Math.min(255, Math.trunc(frame) - 1));
  return { x: (index % 16) * 100 / 15, y: Math.floor(index / 16) * 100 / 15 };
}
