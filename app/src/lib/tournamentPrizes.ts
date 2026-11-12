// Pure display helpers for tournament prizes. The payout table itself is
// computed on the server (DanGG rule, server/tournament.js); the client only
// formats what the server sends, so the numbers can never drift.

export interface PayoutRow {
  place: number;
  amount: number;
  ticket?: string;
}

export interface FinishEvent {
  id?: string | number;
  nick: string;
  place: number;
  payout?: number;
  prize?: number;
  ticket?: string;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const value = Math.floor(Number(n) || 0);
  const teen = value % 100;
  if (teen >= 11 && teen <= 13) return `${value}th`;
  const suffix: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${value}${suffix[value % 10] || 'th'}`;
}

/** The prize cell: the ticket for a satellite seat, otherwise the amount. */
export function prizeText(row: PayoutRow, formatMoney: (amount: number) => string): string {
  return row.ticket ? `${row.ticket} ticket` : formatMoney(row.amount);
}

/** "3 places paid" / "1 place paid". */
export function placesPaidLabel(payouts: readonly PayoutRow[]): string {
  const count = payouts.length;
  return `${count} ${count === 1 ? 'place' : 'places'} paid`;
}

/**
 * The bubble line during play: "Bubble: 4th" while more players remain than
 * places paid, "In the money" once everyone left is paid, and nothing when the
 * field size is unknown or the event is decided.
 */
export function bubbleLabel(payouts: readonly PayoutRow[], playersLeft: number | null | undefined): string | null {
  if (!payouts.length || playersLeft == null || playersLeft <= 1) return null;
  if (playersLeft <= payouts.length) return 'In the money';
  return `Bubble: ${ordinal(payouts.length + 1)}`;
}

/** The finish toast for any paid place. */
export function finishToast(evt: FinishEvent, formatMoney: (amount: number) => string): { title: string; body: string } {
  const amount = Number(evt.payout ?? evt.prize ?? 0);
  const prize = evt.ticket ? `${evt.ticket} ticket` : formatMoney(amount);
  return { title: `Finished ${ordinal(evt.place)}`, body: `${evt.nick} wins ${prize}` };
}

/** The winner presentation title: the win, or the real paid place. */
export function finishTitle(place: number | undefined): string {
  return !place || place === 1 ? 'TOURNAMENT WINNER' : `FINISHED ${ordinal(place).toUpperCase()}`;
}
