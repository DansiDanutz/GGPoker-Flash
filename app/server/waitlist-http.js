/**
 * Wait-list HTTP API (P0 slice W3).
 *
 *   POST   /api/tables/:id/waitlist         join a table queue
 *   DELETE /api/tables/:id/waitlist         leave it (a held seat passes to the next player)
 *   POST   /api/lobby/groups/:key/waitlist  join a group queue (`game:sb/bb:seats`, URL-encoded)
 *   DELETE /api/lobby/groups/:key/waitlist  leave it
 *   GET    /api/waitlists/me                the caller's queues and held-seat offers
 *
 * A join that finds room answers `{ status: 'seat' }` instead of queueing: the client then
 * joins the table over the socket as usual. Private tables answer 404 to everyone except
 * the owner and invitees (a player who opened the invite link, i.e. is connected to the
 * live table, or sits there), so their existence does not leak.
 */
import * as waitlist from './waitlist.js';
import { parseTableId, parseGroupKey } from './validate.js';

const TABLE_ROUTE = /^\/api\/tables\/([^/]+)\/waitlist$/;
const GROUP_ROUTE = /^\/api\/lobby\/groups\/([^/]+)\/waitlist$/;
const ME_ROUTE = '/api/waitlists/me';
const MUTATING = new Set(['POST', 'DELETE']);

const sameUser = (a, b) => a != null && b != null && Number(a) === Number(b);

/** `{ kind, tableId | groupKey }` for a queue key. */
export function queueTarget(queueKey) {
  return queueKey.startsWith('g:')
    ? { kind: 'group', groupKey: queueKey.slice(2) }
    : { kind: 'table', tableId: queueKey.slice(2) };
}

/**
 * @param {{
 *   json: (res: any, code: number, body: object) => void,
 *   requireUser: (req: any, res: any) => any,
 *   limiter: { isBlocked: (key: string) => boolean, record: (key: string) => void },
 *   db: any,
 *   liveTables: Map<string, { table: any, clients: Set<any> }>,
 *   getState: () => any,
 *   commit: (state: any) => void,
 *   leaveQueue: (queueKey: string, userId: number) => boolean,
 * }} deps
 */
export function createWaitlistRoutes(deps) {
  const { json, requireUser, limiter, db, liveTables, getState, commit, leaveQueue } = deps;
  const tableById = (id) => db.prepare('SELECT * FROM tables WHERE id = ? AND enabled = 1').get(id);

  function canUseTable(row, userId) {
    if (!row.private || sameUser(row.owner_id, userId)) return true;
    const entry = liveTables.get(row.id);
    if (!entry) return false;
    return !!entry.table.seatOf(userId) || [...entry.clients].some((ws) => sameUser(ws.userId, userId));
  }

  /** Seats a newcomer could take: empty (unheld for others) or bot-occupied. */
  function openSeats(row, userId) {
    const table = liveTables.get(row.id)?.table;
    if (!table) return Array.from({ length: row.seats }, (_, i) => i); // not running: all open
    return table.seats
      .filter((s) => (s.player ? s.player.isBot : !table.isHeldFor(s.index, userId)))
      .map((s) => s.index);
  }

  function queuedReply(res, result) {
    if (result.status === 'full') return json(res, 409, { status: 'full', error: 'The waiting list is full' });
    if (result.status === 'limit') return json(res, 409, { status: 'limit', error: 'You are on too many waiting lists' });
    const size = waitlist.queueSize(getState(), result.queueKey);
    return json(res, 200, { status: 'queued', position: result.position, size, queueKey: result.queueKey, ...queueTarget(result.queueKey) });
  }

  function joinTable(res, u, row) {
    const live = liveTables.get(row.id)?.table;
    if (live?.seatOf(u.id)) return json(res, 409, { error: 'You are already seated at this table' });
    if (openSeats(row, u.id).length) return json(res, 200, { status: 'seat', tableId: row.id });
    const result = waitlist.join(getState(), u.id, { tableId: row.id });
    commit(result.state);
    return queuedReply(res, result);
  }

  function joinGroup(res, u, group) {
    const rows = db.prepare(`SELECT * FROM tables WHERE enabled = 1 AND COALESCE(private,0) = 0
      AND game = ? AND sb = ? AND bb = ? AND seats = ? ORDER BY sort ASC`).all(group.game, group.sb, group.bb, group.seats);
    if (!rows.length) return json(res, 404, { error: 'not found' });
    const tables = rows
      .filter((row) => !liveTables.get(row.id)?.table.seatOf(u.id))
      .map((row) => ({ id: row.id, freeSeats: openSeats(row, u.id) }));
    const result = waitlist.join(getState(), u.id, { groupKey: group.key, tables });
    if (result.status === 'seat') return json(res, 200, { status: 'seat', tableId: result.tableId, seat: result.seat });
    commit(result.state);
    return queuedReply(res, result);
  }

  function myWaitlists(res, u) {
    const state = getState();
    const nameOf = (id) => tableById(id)?.name || id;
    const queues = waitlist.queuesOf(state, u.id).map((q) => {
      const target = queueTarget(q.queueKey);
      return { ...q, ...target, ...(target.tableId ? { tableName: nameOf(target.tableId) } : {}) };
    });
    const offers = state.offers.filter((o) => sameUser(o.userId, u.id)).map((o) => ({
      tableId: o.tableId, tableName: nameOf(o.tableId), seat: o.seat, deadline: o.deadline, holdMs: o.holdMs,
    }));
    return json(res, 200, { queues, offers });
  }

  function handleTable(req, res, u, rawId) {
    const id = parseTableId(rawId);
    if (!id) return json(res, 400, { error: 'Invalid table id' });
    const row = tableById(id);
    if (!row || !canUseTable(row, u.id)) return json(res, 404, { error: 'not found' });
    if (req.method === 'POST') return joinTable(res, u, row);
    return json(res, 200, { ok: true, left: leaveQueue(waitlist.tableQueue(id), u.id) });
  }

  function handleGroup(req, res, u, rawKey) {
    const group = parseGroupKey(rawKey);
    if (!group) return json(res, 400, { error: 'Invalid group key' });
    if (req.method === 'POST') return joinGroup(res, u, group);
    return json(res, 200, { ok: true, left: leaveQueue(waitlist.groupQueue(group.key), u.id) });
  }

  /** Handle a wait-list route. Returns false when `pathname` is not one. */
  return function handle(req, res, pathname) {
    const tableMatch = TABLE_ROUTE.exec(pathname);
    const groupMatch = GROUP_ROUTE.exec(pathname);
    const isMe = pathname === ME_ROUTE;
    if (!tableMatch && !groupMatch && !isMe) return false;
    const u = requireUser(req, res);
    if (!u) return true;
    if (isMe) {
      if (req.method === 'GET') myWaitlists(res, u);
      else json(res, 405, { error: 'method not allowed' });
      return true;
    }
    if (!MUTATING.has(req.method)) { json(res, 405, { error: 'method not allowed' }); return true; }
    const key = `waitlist:${u.id}`;
    if (limiter.isBlocked(key)) { json(res, 429, { error: 'Too many wait-list requests. Try again shortly.' }); return true; }
    limiter.record(key);
    if (tableMatch) handleTable(req, res, u, tableMatch[1]);
    else handleGroup(req, res, u, groupMatch[1]);
    return true;
  };
}
