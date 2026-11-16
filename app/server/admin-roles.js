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
 * @param {unknown} admin  boolean legacy flag or owner/moderator/player role
 */
export function setAdminRole(actor, targetId, admin) {
  const role = typeof admin === 'boolean' ? (admin ? 'owner' : 'player') : admin;
  if (!['owner', 'moderator', 'player'].includes(role)) return { status: 400, body: { error: 'role must be owner, moderator or player' } };
  db.exec('BEGIN IMMEDIATE');
  try {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(targetId);
    if (!target) { db.exec('ROLLBACK'); return { status: 404, body: { error: 'not found' } }; }
    if ((target.role || (target.is_admin ? 'owner' : 'player')) === role) {
      db.exec('ROLLBACK');
      return { status: 200, body: { ok: true, changed: false, user: publicUser(target) } };
    }
    if (role !== 'owner' && isActiveAdmin(target) && countActiveAdmins() <= 1) {
      db.exec('ROLLBACK');
      return { status: 409, body: { error: LAST_ADMIN_ERROR } };
    }
    db.prepare('UPDATE users SET role = ?,is_admin = ? WHERE id = ?').run(role, role === 'owner' ? 1 : 0, targetId);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)')
      .run(actor.login, typeof admin === 'boolean' ? (admin ? 'grant_admin' : 'revoke_admin') : 'set_role', typeof admin === 'boolean' ? `user ${targetId} (${target.login})` : `user ${targetId} (${target.login}) ${role}`);
    db.exec('COMMIT');
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    return { status: 200, body: { ok: true, changed: true, user: publicUser(updated) } };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
