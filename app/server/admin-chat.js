/**
 * Admin chat moderation.
 *
 *   GET  /api/admin/chat?tableId=<id>&limit=100   recent table-chat lines (every table when tableId is omitted)
 *                                                 plus the distinct tables that have chat
 *   POST /api/admin/chat/:id/delete               remove one line and write a `chat_delete` audit row
 *
 * POST /api/admin/chat (announcements) stays in index.js; this handler leaves it alone.
 * Muting reuses the existing POST /api/admin/users/:id { action: 'mute' } route.
 */
import { tableChannel } from './chat.js';
import { parseTableId } from './validate.js';

const LIST_ROUTE = '/api/admin/chat';
const DELETE_ROUTE = /^\/api\/admin\/chat\/(\d+)\/delete$/;
const TABLE_PREFIX = 'table:';
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;
const AUDIT_TEXT_CHARS = 120;

/** Clamp the `limit` query value; anything missing or invalid falls back to the default. */
export function parseLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/** Recent table-chat lines, newest first. `tableId` null means every table channel. */
export function listMessages(db, { tableId, limit }) {
  const cols = 'm.id, m.channel, m.user_id, m.nick, m.message AS text, m.created_at';
  if (tableId) {
    return db.prepare(`SELECT ${cols} FROM chat_messages m WHERE m.channel = ? ORDER BY m.id DESC LIMIT ?`)
      .all(tableChannel(tableId), limit);
  }
  return db.prepare(`SELECT ${cols} FROM chat_messages m WHERE m.channel LIKE ? ORDER BY m.id DESC LIMIT ?`)
    .all(`${TABLE_PREFIX}%`, limit);
}

/** Every table that has persisted chat, with its line count and latest activity. */
export function listChatTables(db, tableNameOf) {
  return db.prepare(`SELECT channel, COUNT(*) AS count, MAX(created_at) AS last_at FROM chat_messages
      WHERE channel LIKE ? GROUP BY channel ORDER BY last_at DESC`)
    .all(`${TABLE_PREFIX}%`)
    .map((r) => {
      const tableId = r.channel.slice(TABLE_PREFIX.length);
      return { tableId, name: tableNameOf(tableId), count: r.count, lastAt: r.last_at };
    });
}

/**
 * @param {{
 *   db: any,
 *   json: (res: any, code: number, body: object) => void,
 *   requireAdmin: (req: any, res: any) => any,
 *   tableNameOf: (tableId: string) => string,
 *   onDeleted: (row: { id: number, channel: string }) => void,
 * }} deps
 */
export function createAdminChatRoutes({ db, json, requireAdmin, tableNameOf, onDeleted }) {
  function handleList(res, url) {
    const rawTable = url.searchParams.get('tableId');
    const tableId = rawTable === null || rawTable === '' ? null : parseTableId(rawTable);
    if (rawTable && !tableId) return json(res, 400, { error: 'Invalid table id' });
    const limit = parseLimit(url.searchParams.get('limit'));
    return json(res, 200, { messages: listMessages(db, { tableId, limit }), tables: listChatTables(db, tableNameOf) });
  }

  function handleDelete(res, admin, id) {
    const row = db.prepare('SELECT id, channel, user_id, nick, message FROM chat_messages WHERE id = ?').get(id);
    if (!row) return json(res, 404, { error: 'Message not found' });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(admin.login, 'chat_delete',
        `msg ${row.id} ${row.channel} user ${row.user_id} (${row.nick}): ${String(row.message).slice(0, AUDIT_TEXT_CHARS)}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    onDeleted({ id: row.id, channel: row.channel });
    return json(res, 200, { ok: true, id: row.id, channel: row.channel });
  }

  /** Handle an admin chat-moderation route. Returns false when it is not one. */
  return function handle(req, res, url) {
    const pathname = url.pathname;
    const del = DELETE_ROUTE.exec(pathname);
    const isList = pathname === LIST_ROUTE && req.method === 'GET';
    if (!isList && !del) return false;
    const admin = requireAdmin(req, res);
    if (!admin) return true;
    if (isList) handleList(res, url);
    else if (req.method === 'POST') handleDelete(res, admin, Number(del?.[1]));
    else json(res, 405, { error: 'method not allowed' });
    return true;
  };
}
