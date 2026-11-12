// Auto top-up amount (native auto-buy-in): chips needed to bring the stack up to the target,
// kept inside the table's buy-in limits so the server never rejects it.

export type TopUpInput = { stack: number; trigger: number; target: number; min: number; max: number };

export function autoTopUpAmount({ stack, trigger, target, min, max }: TopUpInput): number {
  if (stack >= trigger) return 0;
  const wanted = Math.min(Math.max(target, min), max);
  return Math.max(0, Math.floor(wanted - stack));
}
