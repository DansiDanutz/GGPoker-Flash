// SPDX-License-Identifier: AGPL-3.0-only
// Service credits are separate from poker chips and publisher commission credits.
export const ORGANIZER_TARIFFS = Object.freeze({ membership: 900, cash_setup: 1000, tournament_setup: 500, spin_setup: 300, reschedule: 100, cash_hour: 500, cash_start: 500 });
const HOUR = 3600000;
const MAX_CENTS = 9_000_000_000;
function fail(message, status = 400, code = 'organizer_billing_invalid') {
  throw Object.assign(new Error(message), { status, code });
}
function uid(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('Invalid user ID.');
  return value;
}
function key(value) {
  if (typeof value !== 'string' || !/^[\w:.\-]{1,160}$/.test(value)) fail('Invalid idempotency key.');
  return value;
}
function nextMonth(ms) {
  const date = new Date(ms), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createOrganizerBilling({ db, now = Date.now, mode = 'off', onOrganizerMembership = null }) {
  if (!['off', 'enforce'].includes(mode)) fail('Billing mode must be off or enforce.');
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_billing_accounts (user_id INTEGER PRIMARY KEY REFERENCES users(id), balance_cents INTEGER NOT NULL DEFAULT 0 CHECK(balance_cents >= 0));
    CREATE TABLE IF NOT EXISTS organizer_billing_memberships (user_id INTEGER NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('organizer','contributor')), active INTEGER NOT NULL DEFAULT 1, expires_at TEXT NOT NULL, PRIMARY KEY(user_id,role));
    CREATE TABLE IF NOT EXISTS organizer_billing_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, reference TEXT NOT NULL UNIQUE, resource_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS organizer_billing_operations (user_id INTEGER NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, result_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(user_id,idempotency_key));
    CREATE TABLE IF NOT EXISTS organizer_cash_sessions (user_id INTEGER NOT NULL REFERENCES users(id), table_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0, paid_until TEXT NOT NULL, next_charge_at TEXT NOT NULL, started_at TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS organizer_billing_ledger_no_update BEFORE UPDATE ON organizer_billing_ledger BEGIN SELECT RAISE(ABORT,'immutable billing ledger'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_billing_ledger_no_delete BEFORE DELETE ON organizer_billing_ledger BEGIN SELECT RAISE(ABORT,'immutable billing ledger'); END;
  `);
  const stamp = () => new Date(now()).toISOString();
  // Restarted servers never charge for hours when they could not serve games.
  if (mode === 'enforce') db.prepare('UPDATE organizer_cash_sessions SET active=0 WHERE paid_until<=?').run(stamp());
  const activeUser = (id) => db.prepare('SELECT id FROM users WHERE id=? AND deleted_at IS NULL AND banned=0').get(uid(id));
  function user(id) { if (!activeUser(id)) fail('Active user required.', 403, 'user_inactive'); }
  function enabled() { if (mode !== 'enforce') fail('Organizer billing is disabled.', 409, 'billing_disabled'); }
  const ensure = (id) => db.prepare('INSERT OR IGNORE INTO organizer_billing_accounts(user_id) VALUES (?)').run(uid(id));
  const balance = (id) => db.prepare('SELECT balance_cents FROM organizer_billing_accounts WHERE user_id=?').get(id)?.balance_cents || 0;
  function access(id, role) {
    const row = db.prepare('SELECT * FROM organizer_billing_memberships WHERE user_id=? AND role=?').get(id, role);
    return { active: !!row && row.active === 1 && Date.parse(row.expires_at) > now(), expires_at: row?.expires_at || null };
  }
  function requireMembership(id, role) {
    user(id);
    const membership = access(id, role);
    if (mode === 'enforce' && !membership.active) fail(`Active ${role} membership required.`, 402, 'membership_required');
    return membership;
  }
  function account(id) {
    user(id);
    return { mode, balance_cents: balance(id), memberships: { organizer: access(id, 'organizer'), contributor: access(id, 'contributor') } };
  }
  function journal(id, kind, amount, reference, resource, metadata = {}) {
    db.prepare('INSERT INTO organizer_billing_ledger(user_id,kind,amount_cents,reference,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, kind, amount, reference, resource || null, JSON.stringify(metadata), stamp());
  }
  function debit(id, amount, kind, reference, resource, metadata) {
    ensure(id);
    const result = db.prepare('UPDATE organizer_billing_accounts SET balance_cents=balance_cents-? WHERE user_id=? AND balance_cents>=?').run(amount, id, amount);
    if (result.changes !== 1) fail('Insufficient service credits.', 402, 'insufficient_credit');
    journal(id, kind, -amount, reference, resource, metadata);
  }
  function operation(id, k, kind, payload) {
    key(k);
    const old = db.prepare('SELECT * FROM organizer_billing_operations WHERE user_id=? AND idempotency_key=?').get(id, k);
    if (!old) return null;
    if (old.kind !== kind || old.payload !== payload) fail('Idempotency key already used with different details.', 409, 'idempotency_conflict');
    return JSON.parse(old.result_id);
  }
  function record(id, k, kind, payload, result) {
    db.prepare('INSERT INTO organizer_billing_operations VALUES (?,?,?,?,?,?)').run(id, k, kind, payload, JSON.stringify(result), stamp());
    return result;
  }
  const credit = ({ userId, amountCents, reference, actor }) => transaction(db, () => {
    user(userId); user(actor);
    if (!db.prepare('SELECT id FROM users WHERE id=? AND is_admin=1').get(actor)) fail('Verified operator required.', 403, 'operator_required');
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) fail('Amount must be a bounded USD-cent integer.');
    if (typeof reference !== 'string' || !reference.trim() || reference.trim().length > 160) fail('A receipt reference of 1–160 characters is required.');
    const receipt = reference.trim(), ref = `topup:${receipt}`;
    const old = db.prepare('SELECT * FROM organizer_billing_ledger WHERE reference=?').get(ref);
    if (old) {
      if (old.user_id !== userId || old.amount_cents !== amountCents || old.kind !== 'credit_topup') fail('Receipt already used with different details.', 409, 'reference_conflict');
      return account(userId);
    }
    ensure(userId);
    if (balance(userId) > MAX_CENTS - amountCents) fail('Service-credit balance limit exceeded.');
    db.prepare('UPDATE organizer_billing_accounts SET balance_cents=balance_cents+? WHERE user_id=?').run(amountCents, userId);
    journal(userId, 'credit_topup', amountCents, ref, null, { actor, receipt });
    db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(actor), 'organizer_credit_topup', JSON.stringify({ userId, amountCents, reference: receipt }));
    return account(userId);
  });
  const subscribe = ({ userId, role, idempotencyKey: k }) => transaction(db, () => {
    enabled(); user(userId);
    if (!['organizer', 'contributor'].includes(role)) fail('Invalid membership role.');
    const old = operation(userId, k, 'subscribe', role);
    if (old) return old;
    const current = access(userId, role);
    const periodStart = current.active ? Date.parse(current.expires_at) : now();
    const expires_at = nextMonth(periodStart);
    debit(userId, ORGANIZER_TARIFFS.membership, 'membership', `membership:${userId}:${k}`, null, { role });
    db.prepare('INSERT INTO organizer_billing_memberships VALUES (?,?,1,?) ON CONFLICT(user_id,role) DO UPDATE SET active=1,expires_at=excluded.expires_at').run(userId, role, expires_at);
    if (role === 'organizer' && onOrganizerMembership) onOrganizerMembership({ organizerId: userId, reference: `membership:${userId}:${k}`, availableAt: new Date(periodStart).toISOString() });
    return record(userId, k, 'subscribe', role, { role, expires_at });
  });
  function replay(userId, k, payload) {
    if (mode !== 'enforce') return null;
    user(userId); key(k);
    const old = db.prepare('SELECT * FROM organizer_billing_operations WHERE user_id=? AND idempotency_key=?').get(userId, k);
    if (!old) return null;
    if (!old.kind.startsWith('setup:') || old.payload !== String(payload)) fail('Idempotency key already used with different details.', 409, 'idempotency_conflict');
    return JSON.parse(old.result_id);
  }
  function setup({ userId, kind, idempotencyKey: k, resourceId, payload = '', create }) {
    if (mode !== 'enforce') return create();
    return transaction(db, () => {
      user(userId);
      if (!['cash', 'spin', 'tournament'].includes(kind)) fail('Invalid setup kind.');
      const details = String(payload || kind), action = `setup:${kind}`;
      const old = operation(userId, k, action, details);
      if (old) return old;
      requireMembership(userId, 'organizer');
      debit(userId, ORGANIZER_TARIFFS[`${kind}_setup`], 'setup', `setup:${userId}:${k}`, resourceId, { kind });
      const result = create();
      if (!result?.id) fail('Resource creation failed.');
      return record(userId, k, action, details, { id: result.id });
    });
  }
  function cashSession(userId, tableId) {
    uid(userId);
    return db.prepare('SELECT * FROM organizer_cash_sessions WHERE user_id=? AND table_id=?').get(userId, tableId) || null;
  }
  const startCash = ({ userId, tableId, idempotencyKey: k }) => transaction(db, () => {
    enabled(); user(userId);
    const old = operation(userId, k, 'cash_start', tableId);
    if (old) return old;
    requireMembership(userId, 'organizer');
    const session = cashSession(userId, tableId), time = now();
    if (session && Date.parse(session.paid_until) > time) {
      db.prepare('UPDATE organizer_cash_sessions SET active=1 WHERE user_id=? AND table_id=?').run(userId, tableId);
    } else {
      debit(userId, ORGANIZER_TARIFFS.cash_hour, 'cash_hour', `cash:${userId}:${k}`, tableId);
      const paid = new Date(time + HOUR).toISOString();
      db.prepare('INSERT INTO organizer_cash_sessions VALUES (?,?,1,?,?,?) ON CONFLICT(table_id) DO UPDATE SET user_id=excluded.user_id,active=1,paid_until=excluded.paid_until,next_charge_at=excluded.next_charge_at,started_at=excluded.started_at').run(userId, tableId, paid, paid, stamp());
    }
    return record(userId, k, 'cash_start', tableId, cashSession(userId, tableId));
  });
  const stopCash = ({ userId, tableId }) => transaction(db, () => {
    uid(userId);
    db.prepare('UPDATE organizer_cash_sessions SET active=0 WHERE user_id=? AND table_id=?').run(userId, tableId);
    return cashSession(userId, tableId);
  });
  function renew(session, time) {
    if (!session?.active) return false;
    const paid = Date.parse(session.paid_until);
    const eligible = activeUser(session.user_id) && access(session.user_id, 'organizer').active;
    if (!eligible || !Number.isFinite(paid) || time - paid >= HOUR || (paid <= time && balance(session.user_id) < ORGANIZER_TARIFFS.cash_hour)) {
      db.prepare('UPDATE organizer_cash_sessions SET active=0 WHERE table_id=?').run(session.table_id);
      return false;
    }
    if (paid > time) return true;
    debit(session.user_id, ORGANIZER_TARIFFS.cash_hour, 'cash_hour', `cash-boundary:${session.table_id}:${session.paid_until}`, session.table_id);
    const until = new Date(paid + HOUR).toISOString();
    db.prepare('UPDATE organizer_cash_sessions SET paid_until=?,next_charge_at=? WHERE table_id=?').run(until, until, session.table_id);
    return true;
  }
  function tickCash() {
    if (mode !== 'enforce') return;
    transaction(db, () => { for (const session of db.prepare('SELECT * FROM organizer_cash_sessions WHERE active=1').all()) renew(session, now()); });
  }
  function canDeal(tableId) {
    if (mode !== 'enforce') return true;
    return transaction(db, () => renew(db.prepare('SELECT * FROM organizer_cash_sessions WHERE table_id=?').get(tableId), now()));
  }
  const reschedule = ({ userId, kind, resourceId, idempotencyKey: k, startAt, change }) => transaction(db, () => {
    enabled(); user(userId);
    if (!['spin', 'tournament'].includes(kind) || !Number.isFinite(Date.parse(startAt))) fail('Invalid reschedule details.');
    const payload = JSON.stringify({ kind, resourceId, startAt });
    const old = operation(userId, k, 'reschedule', payload);
    if (old) return old;
    requireMembership(userId, 'organizer');
    debit(userId, ORGANIZER_TARIFFS.reschedule, 'reschedule', `reschedule:${userId}:${k}`, resourceId, { kind, startAt });
    const result = change();
    if (!result?.id) fail('Reschedule failed.');
    return record(userId, k, 'reschedule', payload, { id: result.id });
  });
  function history(id) {
    user(id);
    return db.prepare('SELECT * FROM organizer_billing_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100').all(id);
  }
  return { mode, tariffs: ORGANIZER_TARIFFS, account, credit, subscribe, requireMembership, setup, replay, cashSession, startCash, stopCash, tickCash, canDeal, reschedule, history };
}
