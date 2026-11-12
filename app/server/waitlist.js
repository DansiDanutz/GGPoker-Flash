/**
 * Pure, immutable wait-list model (P0 slice W1).
 *
 * State in → new state out. No I/O, no globals, no clocks: callers pass `now`.
 *
 * DanGG design decisions (not native GGPoker rules — see docs/designs/p0-design-plan.md):
 *   - FIFO order;
 *   - 30 s seat hold;
 *   - at most 10 players per table queue and 25 per group queue;
 *   - at most 4 concurrent queues (or held offers) per player;
 *   - a group is the same game + stakes + seats (`groupKey`).
 *
 * Queues are keyed `t:<tableId>` (one table) or `g:<groupKey>` (any table in a group).
 * A player receiving an offer leaves the queue; the offer holds the seat until it is
 * accepted, released by `leave`, or passed to the next player by `expire`.
 */

export const HOLD_MS = 30_000;
export const TABLE_CAP = 10;
export const GROUP_CAP = 25;
export const MAX_QUEUES_PER_PLAYER = 4;

const EMPTY = Object.freeze({ queues: Object.freeze({}), offers: Object.freeze([]) });

export function createWaitlist() {
  return EMPTY;
}

export function groupKey(cfg) {
  return `${cfg.game}:${cfg.sb}/${cfg.bb}:${cfg.seats}`;
}

export const tableQueue = (tableId) => `t:${tableId}`;
export const groupQueue = (key) => `g:${key}`;

const capFor = (queueKey) => (queueKey.startsWith('g:') ? GROUP_CAP : TABLE_CAP);
const queueOf = (state, queueKey) => state.queues[queueKey] || [];

function withQueue(state, queueKey, list) {
  const queues = { ...state.queues };
  if (list.length) queues[queueKey] = Object.freeze(list);
  else delete queues[queueKey];
  return Object.freeze({ ...state, queues: Object.freeze(queues) });
}

const withOffers = (state, offers) => Object.freeze({ ...state, offers: Object.freeze(offers) });

/** Number of queues the player is in plus seats they hold. */
function commitments(state, userId) {
  const queued = Object.values(state.queues).filter((list) => list.includes(userId)).length;
  return queued + state.offers.filter((o) => o.userId === userId).length;
}

const isHeld = (state, tableId, seat) => state.offers.some((o) => o.tableId === tableId && o.seat === seat);

/** 1-based queue position, or 0 when the player is not queued. */
export function position(state, userId, queueKey) {
  return queueOf(state, queueKey).indexOf(userId) + 1;
}

/** First unheld free seat among `tables` ([{ id, freeSeats: [seat, …] }]), in order. */
function firstFreeSeat(state, tables) {
  for (const table of tables) {
    const seat = (table.freeSeats || []).find((s) => !isHeld(state, table.id, s));
    if (seat !== undefined) return { tableId: table.id, seat };
  }
  return null;
}

/**
 * Join a table queue (`{ tableId }`) or a group (`{ groupKey, tables }`).
 * A group join with an unheld free seat resolves to that seat instead of queueing.
 * Results: `queued` (with `position`), `seat`, `full` (queue at cap) or `limit`
 * (player already in MAX_QUEUES_PER_PLAYER queues). A duplicate join is `queued` with
 * the existing position and the same state.
 */
export function join(state, userId, target) {
  if (target.groupKey) {
    const free = firstFreeSeat(state, target.tables || []);
    if (free) return { state, status: 'seat', ...free };
  }
  const queueKey = target.groupKey ? groupQueue(target.groupKey) : tableQueue(target.tableId);
  const existing = position(state, userId, queueKey);
  if (existing) return { state, status: 'queued', position: existing, queueKey };
  const list = queueOf(state, queueKey);
  if (list.length >= capFor(queueKey)) return { state, status: 'full', queueKey };
  if (commitments(state, userId) >= MAX_QUEUES_PER_PLAYER) return { state, status: 'limit', queueKey };
  return { state: withQueue(state, queueKey, [...list, userId]), status: 'queued', position: list.length + 1, queueKey };
}

/**
 * Leave a queue. Any seat the player holds from that queue is released and returned
 * in `released` so the caller can offer it again.
 */
export function leave(state, userId, queueKey) {
  const list = queueOf(state, queueKey);
  const dequeued = list.includes(userId) ? withQueue(state, queueKey, list.filter((id) => id !== userId)) : state;
  const released = dequeued.offers.filter((o) => o.userId === userId && o.queueKey === queueKey);
  const next = released.length ? withOffers(dequeued, dequeued.offers.filter((o) => !released.includes(o))) : dequeued;
  return { state: next, released };
}

/**
 * Offer a freed seat to the head of the table queue, falling back to the group queue
 * (`opts.groupKey`). The player leaves the queue and holds the seat until `deadline`.
 * Results: `offered` (with `offer`), `held` (seat already held) or `empty`.
 */
export function offer(state, tableId, seat, now, opts = {}) {
  if (isHeld(state, tableId, seat)) return { state, status: 'held' };
  const holdMs = opts.holdMs ?? HOLD_MS;
  const keys = [tableQueue(tableId), ...(opts.groupKey ? [groupQueue(opts.groupKey)] : [])];
  const queueKey = keys.find((key) => queueOf(state, key).length);
  if (!queueKey) return { state, status: 'empty' };
  const [userId, ...rest] = queueOf(state, queueKey);
  const made = Object.freeze({ tableId, seat, userId, deadline: now + holdMs, queueKey, holdMs });
  const next = withOffers(withQueue(state, queueKey, rest), [...state.offers, made]);
  return { state: next, status: 'offered', offer: made };
}

/** Accept a held seat at `tableId`. Results: `accepted` (with `seat`), `expired` or `none`. */
export function accept(state, userId, tableId, now) {
  const held = state.offers.find((o) => o.userId === userId && o.tableId === tableId);
  if (!held) return { state, status: 'none' };
  if (now >= held.deadline) return { state, status: 'expired' };
  return { state: withOffers(state, state.offers.filter((o) => o !== held)), status: 'accepted', tableId, seat: held.seat };
}

/**
 * Drop every offer whose deadline has passed and pass each seat to the next player in
 * the same queue (#2 becomes the new holder). Returns the `expired` offers and the
 * new `offers` made.
 */
export function expire(state, now) {
  const expired = state.offers.filter((o) => o.deadline <= now);
  if (!expired.length) return { state, expired, offers: [] };
  const base = withOffers(state, state.offers.filter((o) => o.deadline > now));
  return expired.reduce((acc, old) => {
    const groupKeyOf = old.queueKey.startsWith('g:') ? old.queueKey.slice(2) : undefined;
    const result = offer(acc.state, old.tableId, old.seat, now, { groupKey: groupKeyOf, holdMs: old.holdMs });
    return result.status === 'offered'
      ? { ...acc, state: result.state, offers: [...acc.offers, result.offer] }
      : acc;
  }, { state: base, expired, offers: [] });
}
