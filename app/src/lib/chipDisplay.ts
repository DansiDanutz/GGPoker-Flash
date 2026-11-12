// Chips / big-blind display. Only the label changes: every amount sent to the server stays in
// chips (cents for cash games), so switching the display never changes what is bet.

export type AmountMode = 'chips' | 'bb' | 'both';

/** `12.5 BB`-style label; one decimal, like the stack display has always shown. */
export function bbLabel(raw: number, bb: number): string {
  return `${(raw / bb).toFixed(1)} BB`;
}

/**
 * Label for any table amount (stack, bet, pot, bet button). Tournaments and tables without a
 * big blind always show chips; `formatChips` is the table's normal chip formatter.
 */
export function amountLabel(
  raw: number,
  opts: { mode: AmountMode; bb: number; tournament: boolean; formatChips: (v: number) => string },
): string {
  const value = Number(raw) || 0;
  const chips = opts.formatChips(value);
  if (opts.tournament || !(opts.bb > 0)) return chips;
  if (opts.mode === 'bb') return bbLabel(value, opts.bb);
  if (opts.mode === 'both') return `${chips} · ${bbLabel(value, opts.bb)}`;
  return chips;
}

/** Units the bet input works in: whole BB in BB mode, dollars for cash, raw chips in tournaments. */
export function betInputUnit(opts: { mode: AmountMode; bb: number; tournament: boolean }): { divisor: number; suffix: string } {
  if (opts.tournament) return { divisor: 1, suffix: '' };
  if (opts.mode === 'bb' && opts.bb > 0) return { divisor: opts.bb, suffix: 'BB' };
  return { divisor: 100, suffix: '' };
}

const INPUT_DECIMALS = 100;

/** Raw chips to the number shown in the bet input (at most two decimals). */
export function toInputValue(raw: number, divisor: number): number {
  return Math.round((raw / divisor) * INPUT_DECIMALS) / INPUT_DECIMALS;
}

/** A typed bet-input number back to raw chips (whole chips). */
export function fromInputValue(value: number, divisor: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * divisor) : 0;
}
