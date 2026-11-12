// Pure wait-list helpers for the lobby. Kept free of React so Node can test them.

/** Per-table queue cap; mirrors `TABLE_CAP` in server/waitlist.js. */
export const WAITLIST_TABLE_CAP = 10;

/** What the lobby's primary action does for a table. */
export type WaitlistAction = 'join' | 'joinWait' | 'queued' | 'full';

type WaitlistRow = { players: number; seats: number; wait?: number; myWait?: number };

/** Queue length as a whole number; 0 when empty or unknown (native shows `0`, never `-`). */
export function waitCount(table: { wait?: number } | null | undefined): number {
  const n = Number(table?.wait);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Primary action for a table: `queued` when the caller is already in its queue,
 * `join` while a seat is free, `full` when the queue is at its cap, else `joinWait`.
 * `myWait` is the caller's 1-based position (0 = not queued); defaults to the row's.
 */
export function waitlistActionFor(table: WaitlistRow | null | undefined, myWait = table?.myWait ?? 0): WaitlistAction {
  if (!table) return 'join';
  if (myWait > 0) return 'queued';
  if (table.players < table.seats) return 'join';
  return waitCount(table) >= WAITLIST_TABLE_CAP ? 'full' : 'joinWait';
}
