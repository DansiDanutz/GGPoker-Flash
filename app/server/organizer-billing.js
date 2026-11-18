// SPDX-License-Identifier: AGPL-3.0-only
// Service credits are separate from poker chips and publisher commission credits.
export const ORGANIZER_TARIFFS = Object.freeze({ membership: 900, cash_setup: 1000, tournament_setup: 500, spin_setup: 300, reschedule: 100, cash_hour: 500, cash_start: 500,
  cash_hour_tiers: Object.freeze([
    { through: 50, cents: 500 }, { through: 100, cents: 400 }, { through: 200, cents: 300 },
    { through: 500, cents: 200 }, { through: null, cents: 100 },
  ].map(Object.freeze)),
});
export const SQUEEZE_3D_PRICES = Object.freeze({ monthly: 100, lifetime: 1000 });
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
    CREATE TABLE IF NOT EXISTS squeeze_3d_entitlements (user_id INTEGER PRIMARY KEY REFERENCES users(id), plan TEXT NOT NULL CHECK(plan IN ('monthly','lifetime')), expires_at TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS organizer_cash_sessions (user_id INTEGER NOT NULL REFERENCES users(id), table_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0, paid_until TEXT NOT NULL, next_charge_at TEXT NOT NULL, started_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS organizer_billing_refunds (
      request_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), original_reference TEXT NOT NULL,
      original_ledger_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      status TEXT NOT NULL CHECK(status IN ('reserved','paid','cancelled')), external_reference TEXT UNIQUE,
      reason TEXT NOT NULL, actor_id INTEGER NOT NULL, cancelled_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS organizer_billing_ledger_no_update BEFORE UPDATE ON organizer_billing_ledger BEGIN SELECT RAISE(ABORT,'immutable billing ledger'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_billing_ledger_no_delete BEFORE DELETE ON organizer_billing_ledger BEGIN SELECT RAISE(ABORT,'immutable billing ledger'); END;
    CREATE INDEX IF NOT EXISTS organizer_billing_paid_hours ON organizer_billing_ledger(user_id,kind);
  `);
  const stamp = () => new Date(now()).toISOString();
  // Restarted servers never charge for hours when they could not serve games.
  if (mode === 'enforce') db.prepare('UPDATE organizer_cash_sessions SET active=0 WHERE paid_until<=?').run(stamp());
  const activeUser = (id) => db.prepare('SELECT id FROM users WHERE id=? AND deleted_at IS NULL AND banned=0').get(uid(id));
  function user(id) { if (!activeUser(id)) fail('Active user required.', 403, 'user_inactive'); }
  function existingUser(id) { if (!db.prepare('SELECT id FROM users WHERE id=?').get(uid(id))) fail('User not found.', 404, 'user_not_found'); }
  function enabled() { if (mode !== 'enforce') fail('Organizer billing is disabled.', 409, 'billing_disabled'); }
  const ensure = (id) => db.prepare('INSERT OR IGNORE INTO organizer_billing_accounts(user_id) VALUES (?)').run(uid(id));
  const balance = (id) => db.prepare('SELECT balance_cents FROM organizer_billing_accounts WHERE user_id=?').get(id)?.balance_cents || 0;
  function operator(id) {
    user(id);
    if (!db.prepare('SELECT id FROM users WHERE id=? AND is_admin=1').get(id)) fail('Verified operator required.', 403, 'operator_required');
    return id;
  }
  function boundedText(value, name, max = 160) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${name} must contain 1–${max} characters.`);
    return value.trim();
  }
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
    return { mode, balance_cents: balance(id), cash_usage: cashUsage(id), memberships: { organizer: access(id, 'organizer'), contributor: access(id, 'contributor') } };
  }
  function cashUsage(id) {
    // The immutable ledger also includes hours paid before tiered pricing launched.
    const paid_hours = db.prepare("SELECT COUNT(*) n FROM organizer_billing_ledger WHERE user_id=? AND kind='cash_hour' AND amount_cents<0").get(id).n;
    const next_hour = paid_hours + 1;
    return { paid_hours, next_hour, next_hour_cents: ORGANIZER_TARIFFS.cash_hour_tiers.find((tier) => tier.through === null || next_hour <= tier.through).cents };
  }
  function chargeCashHour(id, reference, tableId) {
    const usage = cashUsage(id);
    debit(id, usage.next_hour_cents, 'cash_hour', reference, tableId, { paid_hour: usage.next_hour, rate_cents: usage.next_hour_cents });
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
    user(userId); operator(actor);
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
  const getCreditRefund = (requestId) => db.prepare('SELECT request_id,user_id,original_reference,amount_cents,status,external_reference,reason,created_at FROM organizer_billing_refunds WHERE request_id=?').get(key(requestId)) || null;
  const listCreditRefunds = ({ userId } = {}) => userId == null
    ? db.prepare('SELECT request_id,user_id,original_reference,amount_cents,status,external_reference,reason,created_at FROM organizer_billing_refunds ORDER BY created_at DESC,request_id DESC LIMIT 100').all()
    : db.prepare('SELECT request_id,user_id,original_reference,amount_cents,status,external_reference,reason,created_at FROM organizer_billing_refunds WHERE user_id=? ORDER BY created_at DESC,request_id DESC LIMIT 100').all(uid(userId));
  const reserveCreditRefund = ({ userId, originalReference, amountCents, requestId, actor, reason }) => transaction(db, () => {
    existingUser(userId); operator(actor); requestId = key(requestId); originalReference = boundedText(originalReference, 'originalReference'); reason = boundedText(reason, 'reason', 1000);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) fail('Amount must be a bounded USD-cent integer.');
    const existing = db.prepare('SELECT * FROM organizer_billing_refunds WHERE request_id=?').get(requestId);
    if (existing) {
      if (existing.user_id !== userId || existing.original_reference !== originalReference || existing.amount_cents !== amountCents || existing.actor_id !== actor || existing.reason !== reason) fail('Refund request already used with different details.', 409, 'refund_conflict');
      return getCreditRefund(requestId);
    }
    const source = db.prepare("SELECT * FROM organizer_billing_ledger WHERE reference=? AND user_id=? AND kind='credit_topup'").get(`topup:${originalReference}`, userId);
    if (!source) fail('Original service-credit topup not found for this user.', 409, 'refund_source_invalid');
    const allocated = db.prepare("SELECT COALESCE(SUM(amount_cents),0) total FROM organizer_billing_refunds WHERE original_ledger_id=? AND status IN ('reserved','paid')").get(source.id).total;
    if (allocated + amountCents > source.amount_cents) fail('Original topup has no remaining refundable value.', 409, 'refund_source_exhausted');
    const debitResult = db.prepare('UPDATE organizer_billing_accounts SET balance_cents=balance_cents-? WHERE user_id=? AND balance_cents>=?').run(amountCents, userId, amountCents);
    if (debitResult.changes !== 1) fail('Insufficient service credits.', 402, 'insufficient_credit');
    db.prepare("INSERT INTO organizer_billing_refunds VALUES (?,?,?,?,?,'reserved',NULL,?,?,NULL,?,?)").run(requestId, userId, originalReference, source.id, amountCents, reason, actor, stamp(), stamp());
    journal(userId, 'credit_refund_reserved', -amountCents, `credit-refund:${requestId}:reserve`, originalReference, { actor, requestId, originalReference, reason });
    db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(actor), 'organizer_credit_refund_reserved', JSON.stringify({ requestId, userId, originalReference, amountCents, reason }));
    return getCreditRefund(requestId);
  });
  const markCreditRefundPaid = ({ requestId, externalReference, actor }) => transaction(db, () => {
    operator(actor); requestId = key(requestId); externalReference = boundedText(externalReference, 'externalReference');
    const row = db.prepare('SELECT * FROM organizer_billing_refunds WHERE request_id=?').get(requestId);
    if (!row) fail('Refund request not found.', 404, 'refund_not_found');
    if (row.status === 'paid') {
      if (row.external_reference !== externalReference) fail('Paid refund details cannot be changed.', 409, 'refund_conflict');
      return getCreditRefund(requestId);
    }
    if (row.status !== 'reserved') fail('Only a reserved refund can be marked paid.', 409, 'refund_state');
    if (db.prepare('SELECT 1 FROM organizer_billing_refunds WHERE external_reference=? AND request_id<>?').get(externalReference, requestId)) fail('External refund reference is already used.', 409, 'external_refund_conflict');
    db.prepare("UPDATE organizer_billing_refunds SET status='paid',external_reference=?,updated_at=? WHERE request_id=?").run(externalReference, stamp(), requestId);
    db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(actor), 'organizer_credit_refund_paid', JSON.stringify({ requestId, externalReference }));
    return getCreditRefund(requestId);
  });
  const cancelCreditRefund = ({ requestId, actor, reason }) => transaction(db, () => {
    operator(actor); requestId = key(requestId); reason = boundedText(reason, 'reason', 1000);
    const row = db.prepare('SELECT * FROM organizer_billing_refunds WHERE request_id=?').get(requestId);
    if (!row) fail('Refund request not found.', 404, 'refund_not_found');
    if (row.status === 'cancelled') {
      if (row.cancelled_reason !== reason) fail('Cancelled refund details cannot be changed.', 409, 'refund_conflict');
      return getCreditRefund(requestId);
    }
    if (row.status !== 'reserved') fail('Only a reserved refund can be cancelled.', 409, 'refund_state');
    ensure(row.user_id);
    if (balance(row.user_id) > MAX_CENTS - row.amount_cents) fail('Service-credit balance limit exceeded.');
    db.prepare('UPDATE organizer_billing_accounts SET balance_cents=balance_cents+? WHERE user_id=?').run(row.amount_cents, row.user_id);
    db.prepare("UPDATE organizer_billing_refunds SET status='cancelled',cancelled_reason=?,updated_at=? WHERE request_id=?").run(reason, stamp(), requestId);
    journal(row.user_id, 'credit_refund_cancelled', row.amount_cents, `credit-refund:${requestId}:cancel`, row.original_reference, { actor, requestId, reason });
    db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(actor), 'organizer_credit_refund_cancelled', JSON.stringify({ requestId, reason }));
    return getCreditRefund(requestId);
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
  function squeeze3dAccount(id) {
    user(id);
    const row = db.prepare('SELECT plan,expires_at FROM squeeze_3d_entitlements WHERE user_id=?').get(id);
    return {
      mode,
      purchases_enabled: mode === 'enforce',
      product: { id: 'squeeze-3d', prices: { monthly_cents: SQUEEZE_3D_PRICES.monthly, lifetime_cents: SQUEEZE_3D_PRICES.lifetime } },
      entitlement: row ? { active: row.plan === 'lifetime' || Date.parse(row.expires_at) > now(), plan: row.plan, expires_at: row.expires_at } : { active: false, plan: null, expires_at: null },
      service_credit_balance_cents: balance(id),
    };
  }
  const purchaseSqueeze3d = ({ userId, plan, idempotencyKey: k }) => transaction(db, () => {
    enabled(); user(userId);
    if (typeof plan !== 'string' || !Object.hasOwn(SQUEEZE_3D_PRICES, plan)) fail('Plan must be monthly or lifetime.');
    const old = operation(userId, k, 'squeeze_3d_purchase', plan);
    if (old) return old;
    const current = squeeze3dAccount(userId).entitlement;
    if (current.plan === 'lifetime') fail('Lifetime access is already active.', 409, 'already_lifetime');
    const expires_at = plan === 'lifetime' ? null : nextMonth(current.active ? Date.parse(current.expires_at) : now());
    debit(userId, SQUEEZE_3D_PRICES[plan], 'squeeze_3d', `squeeze-3d:${userId}:${k}`, 'squeeze-3d', { plan });
    db.prepare(`INSERT INTO squeeze_3d_entitlements(user_id,plan,expires_at,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).run(userId, plan, expires_at, stamp());
    return record(userId, k, 'squeeze_3d_purchase', plan, { plan, entitlement: squeeze3dAccount(userId).entitlement });
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
      chargeCashHour(userId, `cash:${userId}:${k}`, tableId);
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
    if (!eligible || !Number.isFinite(paid) || time - paid >= HOUR || (paid <= time && balance(session.user_id) < cashUsage(session.user_id).next_hour_cents)) {
      db.prepare('UPDATE organizer_cash_sessions SET active=0 WHERE table_id=?').run(session.table_id);
      return false;
    }
    if (paid > time) return true;
    chargeCashHour(session.user_id, `cash-boundary:${session.table_id}:${session.paid_until}`, session.table_id);
    const until = new Date(paid + HOUR).toISOString();
    db.prepare('UPDATE organizer_cash_sessions SET paid_until=?,next_charge_at=? WHERE table_id=?').run(until, until, session.table_id);
    return true;
  }
  function tickCash() {
    if (mode !== 'enforce') return;
    transaction(db, () => { for (const session of db.prepare('SELECT * FROM organizer_cash_sessions WHERE active=1 ORDER BY paid_until,table_id').all()) renew(session, now()); });
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
  return { mode, tariffs: ORGANIZER_TARIFFS, account, credit, reserveCreditRefund, markCreditRefundPaid, cancelCreditRefund, getCreditRefund, listCreditRefunds, subscribe, squeeze3dAccount, purchaseSqueeze3d, requireMembership, setup, replay, cashSession, startCash, stopCash, tickCash, canDeal, reschedule, history };
}
