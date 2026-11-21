// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';

const QUOTE_MS = 24 * 60 * 60 * 1000;

import { validClubEntryFee } from './club-entry-price.js';
const NON_GUEST = `(length(login)<>18 OR substr(login,1,6)<>'guest_' OR substr(login,15,1)<>'-' OR lower(substr(login,7,8) || substr(login,16,3)) NOT GLOB '${'[0-9a-f]'.repeat(11)}')`;

function fail(message, status = 400, code = 'club_entry_invalid') {
  throw Object.assign(new Error(message), { status, code });
}
function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`Invalid ${name}.`);
  return value;
}
function bounded(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createClubEntryLedger({ db, clubs, grantBonus, publisherUserId, merchantId, now = Date.now }) {
  if (!clubs || typeof clubs.profile !== 'function' || typeof clubs.approvePaid !== 'function') fail('Organizer clubs service is required.');
  if (typeof grantBonus !== 'function') fail('A synchronous organizer fee credit callback is required.');
  publisherUserId = integer(publisherUserId, 'publisherUserId'); merchantId = bounded(merchantId, 'merchantId', 160);
  db.exec(`
    CREATE TABLE IF NOT EXISTS club_entry_orders (
      id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, organizer_id INTEGER NOT NULL REFERENCES users(id),
      user_id INTEGER NOT NULL REFERENCES users(id), creator_user_id INTEGER NOT NULL REFERENCES users(id), merchant_id TEXT NOT NULL,
      fee_cents INTEGER NOT NULL CHECK(fee_cents BETWEEN 1 AND 100000), payment_link_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','settled','refund_required')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS club_entry_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL UNIQUE REFERENCES club_entry_orders(id),
      provider_order_id TEXT NOT NULL UNIQUE, transaction_id TEXT NOT NULL, network TEXT NOT NULL, token TEXT NOT NULL,
      amount_base_units TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('settled','refund_required')),
      fee_cents INTEGER NOT NULL, creator_gross_cents INTEGER NOT NULL, platform_commission_cents INTEGER NOT NULL,
      creator_net_cents INTEGER NOT NULL, platform_retained_cents INTEGER NOT NULL, organizer_bonus_chips INTEGER NOT NULL,
      received_at TEXT NOT NULL, UNIQUE(network,transaction_id)
    );
    CREATE TABLE IF NOT EXISTS club_creator_earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, creator_user_id INTEGER NOT NULL REFERENCES users(id), order_id TEXT NOT NULL UNIQUE REFERENCES club_entry_orders(id),
      gross_cents INTEGER NOT NULL, platform_commission_cents INTEGER NOT NULL, net_cents INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS club_entry_payments_no_update BEFORE UPDATE ON club_entry_payments BEGIN SELECT RAISE(ABORT,'immutable club entry payment'); END;
    CREATE TRIGGER IF NOT EXISTS club_entry_payments_no_delete BEFORE DELETE ON club_entry_payments BEGIN SELECT RAISE(ABORT,'immutable club entry payment'); END;
    CREATE TRIGGER IF NOT EXISTS club_creator_earnings_no_update BEFORE UPDATE ON club_creator_earnings BEGIN SELECT RAISE(ABORT,'immutable club creator earning'); END;
    CREATE TRIGGER IF NOT EXISTS club_creator_earnings_no_delete BEFORE DELETE ON club_creator_earnings BEGIN SELECT RAISE(ABORT,'immutable club creator earning'); END;
  `);
  const stamp = () => new Date(now()).toISOString();
  if (!db.prepare("SELECT 1 FROM pragma_table_info('club_entry_orders') WHERE name='expires_at'").get()) {
    transaction(db, () => {
      db.exec('ALTER TABLE club_entry_orders ADD COLUMN expires_at TEXT');
      // Honor legacy payments made before upgrade; stop issuing the undated quotes.
      db.prepare("UPDATE club_entry_orders SET expires_at=? WHERE status='pending'").run(stamp());
    });
  }
  db.exec(`CREATE INDEX IF NOT EXISTS club_entry_pending_recent ON club_entry_orders(organizer_id,user_id,expires_at DESC) WHERE status='pending';
    DROP INDEX IF EXISTS club_entry_pending_pair;`);
  const activeUser = (userId) => db.prepare(`SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL AND ${NON_GUEST}`).get(integer(userId, 'userId'));
  const safeOrder = (row) => row && ({ id: row.id, reference: row.reference, organizerId: row.organizer_id, userId: row.user_id, feeCents: row.fee_cents, paymentLinkId: row.payment_link_id, status: row.status === 'pending' && now() >= Date.parse(row.expires_at) ? 'expired' : row.status, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at });
  if (!db.prepare("SELECT 1 FROM pragma_table_info('club_entry_payments') WHERE name='organizer_fee_credit_cents'").get()) {
    db.exec('ALTER TABLE club_entry_payments ADD COLUMN organizer_fee_credit_cents INTEGER NOT NULL DEFAULT 0');
  }
  const orderById = (orderId) => db.prepare('SELECT * FROM club_entry_orders WHERE id=?').get(bounded(orderId, 'orderId', 80));

  function create(args) { return transaction(db, () => createOrder(args)); }
  function createOrder({ organizerId, userId, quotedFeeCents, paymentLinkId, idempotencyKey }) {
    organizerId = integer(organizerId, 'organizerId'); userId = integer(userId, 'userId');
    paymentLinkId = bounded(paymentLinkId, 'paymentLinkId', 160); idempotencyKey = bounded(idempotencyKey, 'idempotencyKey', 160);
    if (!activeUser(userId)) fail('Active payer required.', 403, 'payer_inactive');
    if (organizerId === userId) fail('Club owners already have access.', 409, 'owner_member');
    const keyed = db.prepare('SELECT * FROM club_entry_orders WHERE user_id=? AND idempotency_key=?').get(userId, idempotencyKey);
    if (keyed) {
      if (keyed.organizer_id !== organizerId || keyed.payment_link_id !== paymentLinkId) fail('Idempotency key already used with different details.', 409, 'idempotency_conflict');
      return safeOrder(keyed);
    }
    const pending = db.prepare("SELECT * FROM club_entry_orders WHERE organizer_id=? AND user_id=? AND status='pending' AND expires_at>? ORDER BY expires_at DESC LIMIT 1").get(organizerId, userId, stamp());
    if (pending) return safeOrder(pending);
    const club = clubs.profile(organizerId, userId);
    if (!validClubEntryFee(club.entryFeeCents)) fail('Set a free entry or use $0.25 increments up to $1000.', 409, 'fee_invalid');
    if (club.entryFeeCents === 0) fail('Free clubs do not use paid checkout.', 409, 'club_free');
    if (club.membershipStatus === 'approved') fail('User is already a club member.', 409, 'already_member');
    if (quotedFeeCents !== club.entryFeeCents) fail('Club entry price changed. Request a new checkout.', 409, 'club_price_changed');
    const orderId = randomUUID(), reference = `club-entry:${randomUUID()}`, ts = stamp();
    db.prepare("INSERT INTO club_entry_orders VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?,?)").run(orderId, reference, organizerId, userId, publisherUserId, merchantId, club.entryFeeCents, paymentLinkId, idempotencyKey, ts, ts, new Date(Date.parse(ts) + QUOTE_MS).toISOString());
    return safeOrder(orderById(orderId));
  }

  function get(orderId, userId) {
    const row = orderById(orderId); if (!row || row.user_id !== integer(userId, 'userId')) fail('Order not found.', 404, 'order_not_found');
    return safeOrder(row);
  }

  function settle({ orderId, providerOrderId, transactionId, network, token, amountBaseUnits, paidAt }) {
    providerOrderId = bounded(providerOrderId, 'providerOrderId', 200); transactionId = bounded(transactionId, 'transactionId', 200);
    network = bounded(network, 'network', 80).toLowerCase(); token = bounded(token, 'token', 80); amountBaseUnits = bounded(String(amountBaseUnits), 'amountBaseUnits', 100);
    if (!/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) fail('amountBaseUnits must be a positive integer string.');
    return transaction(db, () => {
      const order = orderById(orderId); if (!order) fail('Order not found.', 404, 'order_not_found');
      const existing = db.prepare('SELECT * FROM club_entry_payments WHERE order_id=?').get(order.id);
      if (existing) {
        if (existing.provider_order_id !== providerOrderId || existing.transaction_id !== transactionId || existing.network !== network || existing.token !== token || existing.amount_base_units !== amountBaseUnits) fail('Order receipt already recorded with different details.', 409, 'receipt_conflict');
        return { order: safeOrder(order), payment: paymentResult(existing), applied: false };
      }
      if (db.prepare('SELECT 1 FROM club_entry_payments WHERE provider_order_id=?').get(providerOrderId)) fail('Provider order is already used.', 409, 'provider_order_conflict');
      if (db.prepare('SELECT 1 FROM club_entry_payments WHERE network=? AND transaction_id=?').get(network, transactionId)) fail('Network transaction is already used.', 409, 'transaction_conflict');
      const paymentTime = Date.parse(paidAt), created = Date.parse(order.created_at);
      if (!Number.isFinite(paymentTime)) fail('Verified payment timestamp required.');
      let eligible = paymentTime >= created && paymentTime < Date.parse(order.expires_at) && !!activeUser(order.user_id);
      try { eligible = eligible && clubs.profile(order.organizer_id, order.user_id).membershipStatus !== 'approved'; } catch { eligible = false; }
      const ts = stamp();
      if (!eligible) {
        db.prepare(`INSERT INTO club_entry_payments(order_id,provider_order_id,transaction_id,network,token,amount_base_units,outcome,fee_cents,creator_gross_cents,platform_commission_cents,creator_net_cents,platform_retained_cents,organizer_bonus_chips,received_at)
          VALUES(?,?,?,?,?,?,'refund_required',?,0,0,0,?,0,?)`).run(order.id, providerOrderId, transactionId, network, token, amountBaseUnits, order.fee_cents, order.fee_cents, ts);
        db.prepare("UPDATE club_entry_orders SET status='refund_required',updated_at=? WHERE id=?").run(ts, order.id);
        return { order: safeOrder(orderById(order.id)), payment: paymentResult(db.prepare('SELECT * FROM club_entry_payments WHERE order_id=?').get(order.id)), applied: true };
      }
      // Integer policy: floor 20% creator gross, then floor 20% commission on that gross.
      const creatorGross = Math.floor(order.fee_cents * 20 / 100);
      const platformCommission = Math.floor(creatorGross * 20 / 100);
      const creatorNet = creatorGross - platformCommission;
      const organizerGross = order.fee_cents - creatorGross;
      const organizerRoyalty = Math.floor(organizerGross / 5);
      const platformRetained = organizerRoyalty + platformCommission;
      const bonus = organizerGross - organizerRoyalty;
      db.prepare(`INSERT INTO club_entry_payments(order_id,provider_order_id,transaction_id,network,token,amount_base_units,outcome,fee_cents,creator_gross_cents,platform_commission_cents,creator_net_cents,platform_retained_cents,organizer_bonus_chips,organizer_fee_credit_cents,received_at)
        VALUES(?,?,?,?,?,?,'settled',?,?,?,?,?,0,?,?)`).run(order.id, providerOrderId, transactionId, network, token, amountBaseUnits, order.fee_cents, creatorGross, platformCommission, creatorNet, platformRetained, bonus, ts);
      db.prepare('INSERT INTO club_creator_earnings(creator_user_id,order_id,gross_cents,platform_commission_cents,net_cents,created_at) VALUES(?,?,?,?,?,?)').run(order.creator_user_id, order.id, creatorGross, platformCommission, creatorNet, ts);
      grantBonus({ organizerId: order.organizer_id, amountCents: bonus, reference: order.reference, orderId: order.id, nonredeemable: true });
      clubs.approvePaid({ organizerId: order.organizer_id, userId: order.user_id });
      db.prepare("UPDATE club_entry_orders SET status='settled',updated_at=? WHERE id=?").run(ts, order.id);
      return { order: safeOrder(orderById(order.id)), payment: paymentResult(db.prepare('SELECT * FROM club_entry_payments WHERE order_id=?').get(order.id)), applied: true };
    });
  }
  const paymentResult = (row) => ({ outcome: row.outcome, feeCents: row.fee_cents, creatorGross20: row.creator_gross_cents, platformCommission4: row.platform_commission_cents, creatorNet16: row.creator_net_cents, platformRoyaltyCents: row.platform_retained_cents, organizerBonusChips: row.organizer_bonus_chips, organizerFeeCreditCents: row.organizer_fee_credit_cents, receivedAt: row.received_at });
  function earnings(creatorId) {
    creatorId = integer(creatorId, 'creatorId');
    const totals = db.prepare('SELECT COALESCE(SUM(gross_cents),0) grossCents,COALESCE(SUM(platform_commission_cents),0) platformCommissionCents,COALESCE(SUM(net_cents),0) netCents,COUNT(*) orders FROM club_creator_earnings WHERE creator_user_id=?').get(creatorId);
    return { creatorId, ...totals, entries: db.prepare('SELECT order_id orderId,gross_cents grossCents,platform_commission_cents platformCommissionCents,net_cents netCents,created_at createdAt FROM club_creator_earnings WHERE creator_user_id=? ORDER BY id DESC LIMIT 100').all(creatorId) };
  }
  return { create, get, settle, earnings };
}
