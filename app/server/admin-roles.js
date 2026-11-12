// Admin role management (P1 slice A1): grant/revoke the admin flag with a last-admin guard.
import { db, publicUser } from './db.js';

export const LAST_ADMIN_ERROR = 'Cannot remove the last remaining admin. Make another player an admin first.';

/** Admins who can actually use the console: flagged, not banned, not deleted. */
export function countActiveAdmins() {
  return db.prepare('SELECT COUNT(*) n FROM users WHERE is_admin = 1 AND banned = 0 AND deleted_at IS NULL').get().n;
}

const isActiveAdmin = (u) => !!u.is_admin && !u.banned && !u.deleted_at;

/**
 * Set or clear `is_admin` on a user. Returns `{ status, body }` for the HTTP layer.
 * @param {{ login: string }} actor  the calling admin
 * @param {number} targetId
 * @param {unknown} admin  must be a boolean
 */
export function setAdminRole(actor, targetId, admin) {
  if (typeof admin !== 'boolean') return { status: 400, body: { error: 'admin must be true or false' } };
  db.exec('BEGIN IMMEDIATE');
  try {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(targetId);
    if (!target) { db.exec('ROLLBACK'); return { status: 404, body: { error: 'not found' } }; }
    if (!!target.is_admin === admin) {
      db.exec('ROLLBACK');
      return { status: 200, body: { ok: true, changed: false, user: publicUser(target) } };
    }
    if (!admin && isActiveAdmin(target) && countActiveAdmins() <= 1) {
      db.exec('ROLLBACK');
      return { status: 409, body: { error: LAST_ADMIN_ERROR } };
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(admin ? 1 : 0, targetId);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)')
      .run(actor.login, admin ? 'grant_admin' : 'revoke_admin', `user ${targetId} (${target.login})`);
    db.exec('COMMIT');
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    return { status: 200, body: { ok: true, changed: true, user: publicUser(updated) } };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
