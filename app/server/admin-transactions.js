/**
 * Admin transactions: filtering, distinct kinds and CSV export.
 *
 *   GET /api/admin/transactions?q=&kind=&limit=300&format=csv
 *   GET /api/admin/transactions/kinds
 *
 * `q` is a case-insensitive substring of the user's login or nick or the memo (`%` and `_`
 * are literal), `kind` matches exactly. `limit` defaults to 300 and is clamped to 1000.
 * Filters combine with AND and rows come newest first. The JSON keeps `transactions`
 * (every transactions column plus `login` and `nick`) and adds the applied `filters`.
 * `format=csv` answers `transactions.csv` instead. Admin-only; the `/api/admin` network
 * gate in index.js runs first.
 */
import { csvField } from './admin-audit.js';

const ROUTE = '/api/admin/transactions';
const KINDS_ROUTE = '/api/admin/transactions/kinds';
export const DEFAULT_LIMIT = 300;
export const MAX_LIMIT = 1000;
export const MAX_FILTER_CHARS = 200;
export const CSV_FILENAME = 'transactions.csv';
export const CSV_COLUMNS = Object.freeze(['id', 'user_id', 'login', 'nick', 'kind', 'amount', 'currency', 'memo', 'created_at']);

/** Clamp the `limit` query value; anything missing or invalid falls back to the default. */
export function parseLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Read and validate the query string.
 * @returns {{ ok: true, filters: { q: string, kind: string, limit: number, format: 'json'|'csv' } } | { ok: false, error: string }}
 */
export function parseTransactionsQuery(searchParams) {
  const text = {};
  for (const key of ['q', 'kind']) {
    const value = (searchParams.get(key) ?? '').trim();
    if (value.length > MAX_FILTER_CHARS) return { ok: false, error: `${key} is too long (max ${MAX_FILTER_CHARS} characters)` };
    text[key] = value;
  }
  const rawFormat = searchParams.get('format');
  const format = rawFormat === null || rawFormat === '' ? 'json' : rawFormat;
  if (format !== 'json' && format !== 'csv') return { ok: false, error: 'format must be json or csv' };
  return { ok: true, filters: { ...text, limit: parseLimit(searchParams.get('limit')), format } };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Transactions matching the filters, newest first, joined to users. Every value is a bound parameter. */
export function listTransactions(db, { q, kind, limit }) {
  const where = [];
  const params = [];
  if (kind) { where.push('t.kind = ?'); params.push(kind); }
  if (q) {
    where.push("(u.login LIKE ? ESCAPE '\\' OR u.nick LIKE ? ESCAPE '\\' OR t.memo LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(q)}%`;
    params.push(pattern, pattern, pattern);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT t.*, u.login, u.nick FROM transactions t LEFT JOIN users u ON u.id = t.user_id ${clause} ORDER BY t.id DESC LIMIT ?`)
    .all(...params, limit);
}

/** Every transaction kind present in the ledger, alphabetical. */
export function listKinds(db) {
  return db.prepare('SELECT DISTINCT kind FROM transactions ORDER BY kind').all().map((r) => r.kind);
}

/** CSV with a header row and CRLF line endings. */
export function toTransactionsCsv(rows) {
  // Numbers go out as-is: a negative amount is data, not a formula, so it skips the `'` guard.
  const cell = (value) => (typeof value === 'number' ? String(value) : csvField(value));
  const lines = [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c])).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

function sendCsv(res, rows) {
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${CSV_FILENAME}"`,
    'cache-control': 'no-store',
  });
  res.end(`\uFEFF${toTransactionsCsv(rows)}`);
}

/**
 * @param {{
 *   db: any,
 *   json: (res: any, code: number, body: object) => void,
 *   requireAdmin: (req: any, res: any) => any,
 * }} deps
 */
export function createAdminTransactionsRoute({ db, json, requireAdmin }) {
  /** Handle the transactions routes. Returns false when the request is not for them. */
  return function handle(req, res, url) {
    if (url.pathname !== ROUTE && url.pathname !== KINDS_ROUTE) return false;
    if (!requireAdmin(req, res)) return true;
    if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return true; }
    if (url.pathname === KINDS_ROUTE) { json(res, 200, { kinds: listKinds(db) }); return true; }
    const parsed = parseTransactionsQuery(url.searchParams);
    if (!parsed.ok) { json(res, 400, { error: parsed.error }); return true; }
    const { format, ...filters } = parsed.filters;
    const rows = listTransactions(db, filters);
    if (format === 'csv') { sendCsv(res, rows); return true; }
    json(res, 200, { transactions: rows, filters });
    return true;
  };
}
