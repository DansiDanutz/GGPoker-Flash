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

/* ------------------------------ W4b: chip, offers, groups ------------------------------ */

/** Seconds a seat offer is held when the server does not say (mirrors HOLD_MS in server/waitlist.js). */
export const OFFER_HOLD_SECONDS = 30;
/** The countdown turns urgent (red ring) at or below this many seconds. */
export const OFFER_URGENT_SECONDS = 10;
/** Screen readers hear the countdown only at these seconds, never every tick. */
export const OFFER_ANNOUNCE_SECONDS: readonly number[] = [30, 10, 5];

/** Minimal queue shape the chip and helpers need (structurally matches `WaitlistQueue`). */
export type QueueLike = {
  queueKey: string;
  position: number;
  size: number;
  kind: 'table' | 'group';
  tableId?: string;
  groupKey?: string;
  tableName?: string;
};

/** Minimal `waitlist_update` shape; position 0 = no longer queued. */
export type QueueUpdate = QueueLike;

/** Whole seconds left on an offer, rounded up, never below 0. */
export function offerSecondsLeft(deadline: number, now: number): number {
  const ms = Number(deadline) - Number(now);
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** `m:ss` countdown label: 24 → `0:24`, 65 → `1:05`. Negative or junk input reads `0:00`. */
export function formatCountdown(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** True in the last {@link OFFER_URGENT_SECONDS} seconds of a live offer. */
export function isOfferUrgent(seconds: number): boolean {
  return seconds > 0 && seconds <= OFFER_URGENT_SECONDS;
}

/** Fraction of the hold still left (1 → 0), for the ring and bar. */
export function offerProgress(seconds: number, holdSeconds = OFFER_HOLD_SECONDS): number {
  if (!(holdSeconds > 0)) return 0;
  return Math.max(0, Math.min(1, seconds / holdSeconds));
}

/** Number of queues the chip counts: only real positions (≥ 1). */
export function chipCount(queues: readonly QueueLike[] | null | undefined): number {
  return (queues || []).filter((q) => q.position > 0).length;
}

/** Accessible chip label: `1 wait list`, `2 wait lists`; empty when the chip hides. */
export function waitlistChipLabel(count: number): string {
  if (!(count > 0)) return '';
  return `${count} wait ${count === 1 ? 'list' : 'lists'}`;
}

/** `#3 of 5`; the size never reads below the position. */
export function queuePositionLabel(q: Pick<QueueLike, 'position' | 'size'>): string {
  return `#${q.position} of ${Math.max(q.position, q.size)}`;
}

/** Lobby group key, `game:sb/bb:seats` (mirrors `groupKey` in server/waitlist.js). */
export function groupKeyOf(t: { game: string; sb: number; bb: number; seats: number }): string {
  return `${t.game}:${t.sb}/${t.bb}:${t.seats}`;
}

/** Human name for a queue: the table's name, or `Hold'em 50/100 · 6-Max` for a group. */
export function queueName(q: QueueLike): string {
  if (q.kind === 'table') return q.tableName || q.tableId || 'Table';
  const m = /^([^:]+):([^/]+)\/([^:]+):(\d+)$/.exec(q.groupKey || '');
  if (!m) return q.groupKey || 'Group';
  const game = m[1] === 'holdem' ? "Hold'em" : m[1].toUpperCase();
  return `${game} ${m[2]}/${m[3]} · ${m[4]}-Max`;
}

/**
 * Apply a `waitlist_update` to the caller's queues without mutating them: position 0
 * removes the queue, otherwise it is updated in place or appended. A table name the
 * event lacks is kept from the existing entry.
 */
export function applyQueueUpdate<Q extends QueueLike>(queues: readonly Q[], update: QueueUpdate): Q[] {
  const rest = queues.filter((q) => q.queueKey !== update.queueKey);
  if (!(update.position > 0)) return rest;
  const old = queues.find((q) => q.queueKey === update.queueKey);
  const merged = { ...(old || {}), ...update, tableName: update.tableName ?? old?.tableName } as Q;
  return old ? queues.map((q) => (q.queueKey === update.queueKey ? merged : q)) : [...rest, merged];
}

/** What a Group View card's button does: `join` while any table has room, else the group queue. */
export type GroupAction = 'join' | 'joinWait' | 'queued';

/**
 * Primary action for a lobby group. `queued` when the caller holds a position in the
 * group queue; `join` while any table in the group has a free seat; else `joinWait`.
 */
export function groupActionFor(
  groupTables: readonly { players: number; seats: number }[],
  myGroupPosition = 0,
): GroupAction {
  if (myGroupPosition > 0) return 'queued';
  return groupTables.some((t) => t.players < t.seats) ? 'join' : 'joinWait';
}
