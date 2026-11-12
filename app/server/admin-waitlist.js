/**
 * Admin wait-list monitor (P0 slice W7).
 *
 *   GET  /api/admin/waitlists        every non-empty queue: members, held seats, oldest wait
 *   POST /api/admin/waitlists/clear  { tableId } | { groupKey } — empty that queue, release its held seats
 *
 * The pure helpers below take the wait-list model state (see waitlist.js) and return new
 * values; the route factory only wires them to I/O supplied by index.js. Join times are not
 * part of the pure model, so index.js keeps them with `trackJoinTimes` on every commit.
 */
import { tableQueue, groupQueue } from './waitlist.js';
import { parseTableId, parseGroupKey } from './validate.js';
import { queueTarget } from './waitlist-http.js';

const LIST_ROUTE = '/api/admin/waitlists';
const CLEAR_ROUTE = '/api/admin/waitlists/clear';

const sinceKey = (queueKey, userId) => `${queueKey}|${userId}`;

/**
 * Join time per queued player, carried across a state change: players new to a queue get
 * `now`, players who left drop out, everyone else keeps their time. Returns a new object.
 */
export function trackJoinTimes(prev, before, after, now) {
  const next = {};
  for (const [queueKey, list] of Object.entries(after.queues)) {
    const wasQueued = new Set(before.queues[queueKey] || []);
    for (const userId of list) {
      const key = sinceKey(queueKey, userId);
      next[key] = wasQueued.has(userId) && prev[key] !== undefined ? prev[key] : now;
    }
  }
  return Object.freeze(next);
}

/** Every queue key that has players waiting or seats held, sorted. */
export function activeQueueKeys(state) {
  const keys = new Set([...Object.keys(state.queues), ...state.offers.map((o) => o.queueKey)]);
  return [...keys].sort();
}

/** Display name for a group key `game:sb/bb:seats`. */
export function groupName(groupKey) {
  const group = parseGroupKey(encodeURIComponent(groupKey));
  return group ? `${group.game} ${group.sb}/${group.bb} · ${group.seats}-max` : groupKey;
}

/**
 * Admin view of every active queue.
 * @param {any} state wait-list model state
 * @param {{ joinedAt: Record<string, number>, now: number,
 *   nickOf: (userId: number) => string, tableNameOf: (tableId: string) => string }} ctx
 */
export function summarizeQueues(state, ctx) {
  const { joinedAt, now, nickOf, tableNameOf } = ctx;
  const queues = activeQueueKeys(state).map((queueKey) => {
    const target = queueTarget(queueKey);
    const positions = (state.queues[queueKey] || []).map((userId, i) => {
      const since = joinedAt[sinceKey(queueKey, userId)];
      return { userId, nick: nickOf(userId), position: i + 1, waitingMs: since === undefined ? 0 : Math.max(0, now - since) };
    });
    const held = state.offers.filter((o) => o.queueKey === queueKey).map((o) => ({
      userId: o.userId, nick: nickOf(o.userId), tableId: o.tableId, tableName: tableNameOf(o.tableId),
      seat: o.seat, deadline: o.deadline, remainingMs: Math.max(0, o.deadline - now),
    }));
    const name = target.tableId ? tableNameOf(target.tableId) : groupName(target.groupKey);
    const oldestWaitMs = positions.reduce((max, p) => Math.max(max, p.waitingMs), 0);
    return { queueKey, ...target, name, length: positions.length, positions, held, oldestWaitMs };
  });
  const totals = {
    queues: queues.length,
    waiting: queues.reduce((n, q) => n + q.length, 0),
    held: queues.reduce((n, q) => n + q.held.length, 0),
  };
  return { queues, totals };
}

/**
 * Remove a queue and every seat offer made from it. Returns the new state, the players
 * who were waiting (`removed`) and the offers whose seats are now free (`released`).
 */
export function clearQueue(state, queueKey) {
  const removed = state.queues[queueKey] || [];
  const released = state.offers.filter((o) => o.queueKey === queueKey);
  const queues = { ...state.queues };
  delete queues[queueKey];
  const next = Object.freeze({
    ...state,
    queues: Object.freeze(queues),
    offers: Object.freeze(state.offers.filter((o) => o.queueKey !== queueKey)),
  });
  return { state: next, removed, released };
}

/** Queue key from a clear request body, or an error message. */
export function parseClearTarget(body) {
  const hasTable = body && body.tableId !== undefined;
  const hasGroup = body && body.groupKey !== undefined;
  if (hasTable === hasGroup) return { error: 'Send exactly one of tableId or groupKey' };
  if (hasTable) {
    const tableId = parseTableId(body.tableId);
    return tableId ? { queueKey: tableQueue(tableId) } : { error: 'Invalid table id' };
  }
  const group = parseGroupKey(encodeURIComponent(String(body.groupKey)));
  return group ? { queueKey: groupQueue(group.key) } : { error: 'Invalid group key' };
}

/**
 * @param {{
 *   json: (res: any, code: number, body: object) => void,
 *   requireAdmin: (req: any, res: any) => any,
 *   readBody: (req: any) => Promise<any>,
 *   summarize: () => object,
 *   isActive: (queueKey: string) => boolean,
 *   clear: (queueKey: string, admin: any) => { removed: number[], released: object[] },
 * }} deps
 */
export function createAdminWaitlistRoutes(deps) {
  const { json, requireAdmin, readBody, summarize, isActive, clear } = deps;

  async function handleClear(req, res, admin) {
    let body;
    try { body = await readBody(req); } catch (e) {
      return json(res, e.status || 400, { error: e.status ? e.message : 'Invalid JSON body' });
    }
    const target = parseClearTarget(body);
    if (target.error) return json(res, 400, { error: target.error });
    if (!isActive(target.queueKey)) return json(res, 404, { error: 'No such wait list' });
    const result = clear(target.queueKey, admin);
    return json(res, 200, {
      ok: true, queueKey: target.queueKey, ...queueTarget(target.queueKey),
      removed: result.removed.length, released: result.released.length,
    });
  }

  /** Handle an admin wait-list route. Returns false when `pathname` is not one. */
  return async function handle(req, res, pathname) {
    if (pathname !== LIST_ROUTE && pathname !== CLEAR_ROUTE) return false;
    const admin = requireAdmin(req, res);
    if (!admin) return true;
    if (pathname === LIST_ROUTE && req.method === 'GET') json(res, 200, summarize());
    else if (pathname === CLEAR_ROUTE && req.method === 'POST') await handleClear(req, res, admin);
    else json(res, 405, { error: 'method not allowed' });
    return true;
  };
}
