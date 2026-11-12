/**
 * Idempotent schema and data migrations for money and identity fixes.
 *
 * - Welcome bonus: registration used to credit the welcome money without a bonus_claims
 *   row, so the Cashier offered (and paid) the welcome bonus a second time. Every user
 *   with a 'welcome' ledger entry gets the claim row.
 * - Player notes: targets were bare nicknames, so a rename lost the notes and a new user
 *   taking an old nick inherited them. Targets become `u:<userId>` for accounts and
 *   `nick:<nick>` for bots and other players without an account (see player-notes.js).
 * - Time Bank Cards: the per-user card balance and hand counter are stored on users so a
 *   rejoin does not refill a spent bank.
 */

export const USER_KEY_PREFIX = 'u:';
export const NICK_KEY_PREFIX = 'nick:';

function addColumn(db, sql) {
  try { db.exec(sql); } catch { /* already exists */ }
}

export function backfillWelcomeClaims(db) {
  return db.prepare(`INSERT OR IGNORE INTO bonus_claims (user_id, claim_key, amount)
    SELECT user_id, 'welcome', MAX(amount) FROM transactions WHERE kind = 'welcome' GROUP BY user_id`).run().changes;
}

/** Re-key legacy nickname note targets; rows already keyed are left alone. */
export function migrateNoteTargets(db) {
  const legacy = db.prepare(`SELECT user_id, target FROM player_notes
    WHERE target NOT LIKE '${USER_KEY_PREFIX}%' AND target NOT LIKE '${NICK_KEY_PREFIX}%'`).all();
  const byNick = db.prepare('SELECT id FROM users WHERE nick = ? ORDER BY deleted_at IS NOT NULL, id LIMIT 1');
  const rekey = db.prepare('UPDATE OR IGNORE player_notes SET target = ? WHERE user_id = ? AND target = ?');
  const drop = db.prepare('DELETE FROM player_notes WHERE user_id = ? AND target = ?');
  let moved = 0;
  for (const row of legacy) {
    const owner = byNick.get(row.target);
    const key = owner ? `${USER_KEY_PREFIX}${owner.id}` : `${NICK_KEY_PREFIX}${row.target}`;
    moved += rekey.run(key, row.user_id, row.target).changes;
    // A keyed note for the same player already exists: the newer keyed row wins.
    drop.run(row.user_id, row.target);
  }
  return moved;
}

export function migrateIdentity(db) {
  addColumn(db, 'ALTER TABLE users ADD COLUMN time_bank_cards INTEGER');
  addColumn(db, 'ALTER TABLE users ADD COLUMN time_bank_hands INTEGER');
  backfillWelcomeClaims(db);
  migrateNoteTargets(db);
}
