// Buy-in bounds and validation for the take-seat dialog. Mirrors the server's seatHuman checks.

export interface BuyInLimits {
  min: number;
  /** The table maximum, lowered to the wallet balance when the wallet holds less. */
  max: number;
  /** False when the wallet cannot cover even the table minimum. */
  canAfford: boolean;
}

export function buyInLimits(tableMin: number, tableMax: number, balance: number | null | undefined): BuyInLimits {
  const wallet = Number.isFinite(balance) ? Math.max(0, Math.floor(balance as number)) : tableMax;
  const max = Math.min(tableMax, wallet);
  return { min: tableMin, max: Math.max(tableMin, max), canAfford: wallet >= tableMin };
}

/** Typed text in display units (dollars for cash, chips when scale is 1) to whole chips; NaN when unreadable. */
export function parseBuyInText(text: string, scale: number): number {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * scale);
}

/** A user-facing error for the typed amount, or null when it can be bought in. */
export function buyInError(amount: number, limits: BuyInLimits, format: (v: number) => string): string | null {
  if (!limits.canAfford) return `Your balance is below the ${format(limits.min)} minimum buy-in.`;
  if (!Number.isFinite(amount)) return 'Enter a buy-in amount.';
  if (amount < limits.min) return `The minimum buy-in is ${format(limits.min)}.`;
  if (amount > limits.max) return `The maximum you can buy in is ${format(limits.max)}.`;
  return null;
}
