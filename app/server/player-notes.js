/**
 * Private player notes keyed by stable identity.
 *
 * A note on an account is stored under `u:<userId>`, so it follows a rename and is never
 * inherited by a new account that later takes the old nickname. Bots and other players
 * without an account have no stable id and keep a `nick:<nick>` key.
 *
 * The client API still speaks nicknames: GET returns each note's current display nick as
 * `target` (plus `key` and `targetId`), and POST accepts a `key`, a `targetId`, or a bare
 * `target` nick that is resolved server-side to the seated player's id.
 */
import { NICK_KEY_PREFIX, USER_KEY_PREFIX } from './identity-migrations.js';
import { normalizeNoteColor } from './player-labels.js';

export const NOTE_MAX = 1000;
const NICK_MAX = 40;
const USER_KEY = /^u:(\d{1,12})$/;

export function userKey(id) { return `${USER_KEY_PREFIX}${id}`; }
export function nickKey(nick) { return `${NICK_KEY_PREFIX}${nick}`; }

function accountIdOf(player) {
  if (!player || player.isBot) return null;
  const id = Number(player.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ findSeated: (nick: string, tableId?: string | null) => { id: unknown, isBot?: boolean } | null }} deps
 */
export function createPlayerNotes(db, { findSeated }) {
  const userById = db.prepare('SELECT id, nick FROM users WHERE id = ?');
  const userByNick = db.prepare('SELECT id FROM users WHERE nick = ? AND deleted_at IS NULL');
  const listRows = db.prepare('SELECT target, note, color, updated_at FROM player_notes WHERE user_id = ?');
  const upsert = db.prepare(`INSERT INTO player_notes (user_id,target,note,color) VALUES (?,?,?,?)
    ON CONFLICT(user_id,target) DO UPDATE SET note=excluded.note, color=excluded.color, updated_at=datetime('now')`);
  const remove = db.prepare('DELETE FROM player_notes WHERE user_id = ? AND target = ?');

  /** @returns {string | null} the storage key for the note's subject */
  function resolveKey({ key, targetId, target, tableId } = {}) {
    const rawKey = typeof key === 'string' ? key : '';
    if (USER_KEY.test(rawKey)) return rawKey;
    if (rawKey.startsWith(NICK_KEY_PREFIX) && rawKey.length > NICK_KEY_PREFIX.length) return rawKey.slice(0, NICK_KEY_PREFIX.length + NICK_MAX);
    const id = Number(targetId);
    if (Number.isInteger(id) && id > 0 && userById.get(id)) return userKey(id);
    const nick = String(target || '').slice(0, NICK_MAX);
    if (!nick) return null;
    const seated = findSeated(nick, tableId ? String(tableId) : null);
    if (seated) {
      const seatedId = accountIdOf(seated);
      return seatedId ? userKey(seatedId) : nickKey(nick);
    }
    const account = userByNick.get(nick);
    return account ? userKey(account.id) : nickKey(nick);
  }

  function displayOf(storedKey) {
    const m = USER_KEY.exec(storedKey);
    if (m) {
      const u = userById.get(Number(m[1]));
      return { target: u ? u.nick : '', targetId: u ? u.id : Number(m[1]) };
    }
    const nick = storedKey.startsWith(NICK_KEY_PREFIX) ? storedKey.slice(NICK_KEY_PREFIX.length) : storedKey;
    return { target: nick, targetId: null };
  }

  function list(ownerId) {
    return listRows.all(ownerId).map((r) => ({
      key: r.target,
      ...displayOf(r.target),
      note: r.note,
      color: normalizeNoteColor(r.color) || 'c9',
      updated_at: r.updated_at,
    }));
  }

  /** Writes (or deletes, for a blank note) one note; returns false when the subject is unknown. */
  function save(ownerId, subject, note, color) {
    const storedKey = resolveKey(subject);
    if (!storedKey) return { ok: false, error: 'missing target' };
    const text = String(note || '').slice(0, NOTE_MAX);
    if (!text.trim()) {
      remove.run(ownerId, storedKey);
      return { ok: true, deleted: true, key: storedKey };
    }
    upsert.run(ownerId, storedKey, text, color);
    return { ok: true, key: storedKey };
  }

  return Object.freeze({ resolveKey, list, save });
}
