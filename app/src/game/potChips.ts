/**
 * The chip pile in the middle of the table.
 *
 * One chip per big blind, at least three, at most twelve, so the pile is
 * visibly bigger after every betting round while the pot label carries the
 * exact amount. Tiers only change the chip colour: gold, red, black.
 */
export function potChipTiers(pot: number, bb: number): number[] {
  const value = Math.max(0, Number(pot) || 0);
  if (value <= 0) return [];
  const unit = Math.max(1, Number(bb) || 1);
  const count = Math.max(3, Math.min(12, Math.ceil(value / unit)));
  return Array.from({ length: count }, (_, i) => (i < 4 ? 0 : i < 8 ? 1 : 2));
}
