/**
 * Admin users list: search, status filter and pagination.
 *
 *   GET /api/admin/users?q=&status=all|active|admin|banned|muted&limit=50&offset=0
 *
 * `q` is a case-insensitive substring of login, nick or email (`%` and `_` are literal).
 * `status`: `all` (default), `active` (not banned), `admin`, `banned` or `muted` (chat muted).
 * `limit` defaults to 50 and is clamped to 200; `offset` defaults to 0. Deleted accounts are
 * never listed. Rows come ordered by id and are mapped through `publicUser`, so password
 * hashes and other private columns never leave the server. The response carries `users`,
 * `total` (rows matching the filters, ignoring paging), the applied `filters`, and
 * `activeAdmins` (admins who are not banned) so the UI can keep its last-admin guard while
 * showing one page. Admin-only; the `/api/admin` network gate in index.js runs first.
 */

const ROUTE = '/api/admin/users';
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const MAX_QUERY_CHARS = 200;
export const STATUSES = Object.freeze(['all', 'active', 'admin', 'banned', 'muted']);

const STATUS_SQL = Object.freeze({
  all: null,
  active: 'banned = 0',
  admin: 'is_admin = 1',
  banned: 'banned = 1',
  muted: 'chat_muted = 1',
});

/** Clamp `limit`; missing or invalid values fall back to the default. */
export function parseLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/** Non-negative integer `offset`; missing or invalid values fall back to 0. */
export function parseOffset(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * Read and validate the query string.
 * @returns {{ ok: true, filters: { q: string, status: string, limit: number, offset: number } } | { ok: false, error: string }}
 */
export function parseUsersQuery(searchParams) {
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length > MAX_QUERY_CHARS) return { ok: false, error: `q is too long (max ${MAX_QUERY_CHARS} characters)` };
  const rawStatus = (searchParams.get('status') ?? '').trim();
  const status = rawStatus === '' ? 'all' : rawStatus;
  if (!STATUSES.includes(status)) return { ok: false, error: `status must be one of ${STATUSES.join(', ')}` };
  return {
    ok: true,
    filters: { q, status, limit: parseLimit(searchParams.get('limit')), offset: parseOffset(searchParams.get('offset')) },
  };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function whereClause({ q, status }) {
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (STATUS_SQL[status]) where.push(STATUS_SQL[status]);
  if (q) {
    where.push("(login LIKE ? ESCAPE '\\' OR nick LIKE ? ESCAPE '\\' OR COALESCE(email, '') LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(q)}%`;
    params.push(pattern, pattern, pattern);
  }
  return { sql: `WHERE ${where.join(' AND ')}`, params };
}

/**
 * One page of users matching the filters plus the total match count. Every value is a bound parameter.
 * @returns {{ rows: object[], total: number }}
 */
export function listUsers(db, filters) {
  const { sql, params } = whereClause(filters);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users ${sql}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM users ${sql} ORDER BY id LIMIT ? OFFSET ?`).all(...params, filters.limit, filters.offset);
  return { rows, total: Number(total) };
}

/** Admins who can still use the console (flagged, not banned, not deleted). */
export function countActiveAdmins(db) {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND banned = 0 AND deleted_at IS NULL').get().n);
}

/**
 * @param {{
 *   db: any,
 *   json: (res: any, code: number, body: object) => void,
 *   requireAdmin: (req: any, res: any) => any,
 *   publicUser: (row: object) => object,
 * }} deps
 */
export function createAdminUsersListRoute({ db, json, requireAdmin, publicUser }) {
  /** Handle GET /api/admin/users. Returns false when the request is not for it. */
  return function handle(req, res, url) {
    if (url.pathname !== ROUTE) return false;
    if (!requireAdmin(req, res)) return true;
    if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return true; }
    const parsed = parseUsersQuery(url.searchParams);
    if (!parsed.ok) { json(res, 400, { error: parsed.error }); return true; }
    const { rows, total } = listUsers(db, parsed.filters);
    json(res, 200, { users: rows.map(publicUser), total, filters: parsed.filters, activeAdmins: countActiveAdmins(db) });
    return true;
  };
}
