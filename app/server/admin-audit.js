/**
 * Admin audit log: filtering and CSV export.
 *
 *   GET /api/admin/audit?actor=&action=&q=&limit=200&format=csv
 *
 * `actor` and `action` match exactly, `q` is a case-insensitive substring of `detail`
 * (`%` and `_` are literal). `limit` defaults to 200 and is clamped to 1000. Filters combine
 * with AND and rows come newest first. `format=csv` answers `audit.csv` instead of JSON.
 * Admin-only; the `/api/admin` network gate in index.js runs first.
 */

const ROUTE = '/api/admin/audit';
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 1000;
export const MAX_FILTER_CHARS = 200;
export const CSV_FILENAME = 'audit.csv';
export const CSV_COLUMNS = Object.freeze(['id', 'actor', 'action', 'detail', 'created_at']);
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Clamp the `limit` query value; anything missing or invalid falls back to the default. */
export function parseLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Read and validate the query string.
 * @returns {{ ok: true, filters: { actor: string, action: string, q: string, limit: number, format: 'json'|'csv' } } | { ok: false, error: string }}
 */
export function parseAuditQuery(searchParams) {
  const text = {};
  for (const key of ['actor', 'action', 'q']) {
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

/** Audit rows matching the filters, newest first. Every value is a bound parameter. */
export function listAudit(db, { actor, action, q, limit }) {
  const where = [];
  const params = [];
  if (actor) { where.push('actor = ?'); params.push(actor); }
  if (action) { where.push('action = ?'); params.push(action); }
  if (q) { where.push("detail LIKE ? ESCAPE '\\'"); params.push(`%${escapeLike(q)}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT id, actor, action, detail, created_at FROM audit_log ${clause} ORDER BY id DESC LIMIT ?`)
    .all(...params, limit);
}

/**
 * One RFC 4180 field. Cells that a spreadsheet would run as a formula get a leading `'`
 * (audit details carry player-supplied text such as report reasons and chat lines).
 */
export function csvField(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with a header row and CRLF line endings. */
export function toAuditCsv(rows) {
  const lines = [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => csvField(r[c])).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {{
 *   db: any,
 *   json: (res: any, code: number, body: object) => void,
 *   requireAdmin: (req: any, res: any) => any,
 * }} deps
 */
export function createAdminAuditRoute({ db, json, requireAdmin }) {
  /** Handle GET /api/admin/audit. Returns false when the request is not for it. */
  return function handle(req, res, url) {
    if (url.pathname !== ROUTE) return false;
    if (!requireAdmin(req, res)) return true;
    if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return true; }
    const parsed = parseAuditQuery(url.searchParams);
    if (!parsed.ok) { json(res, 400, { error: parsed.error }); return true; }
    const { format, ...filters } = parsed.filters;
    const rows = listAudit(db, filters);
    if (format === 'csv') {
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${CSV_FILENAME}"`,
        'cache-control': 'no-store',
      });
      res.end(`\uFEFF${toAuditCsv(rows)}`);
      return true;
    }
    json(res, 200, { log: rows, filters });
    return true;
  };
}
