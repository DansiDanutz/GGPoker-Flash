// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { verifyClubEntryPayment } from './club-entry-provider.js';

const MAX_CHIPS = 9_000_000_000;
const MAX_FEE_CENTS = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message, status = 400, code = 'organizer_funding_invalid') {
  throw Object.assign(new Error(message), { status, code });
}
function integer(value, name, max = MAX_CHIPS) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(`${name} must be a bounded positive integer.`);
  return value;
}
function text(value, name, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
function uuid(value, name) {
  value = text(value, name, 80);
  if (!UUID.test(value)) fail(`Invalid ${name}.`);
  return value;
}
function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createOrganizerFunding({ db, chips, now = Date.now }) {
  if (!chips || typeof chips.moveInTransaction !== 'function') fail('Organizer chips service is required.', 500);
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_funding_requests (
      id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, organizer_id INTEGER NOT NULL REFERENCES users(id),
      user_id INTEGER NOT NULL REFERENCES users(id), amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9000000000),
      idempotency_key TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('requested','offered','paid','credited','rejected')),
      fee_cents INTEGER CHECK(fee_cents BETWEEN 1 AND 100000), payment_link_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS organizer_funding_receipts (
      request_id TEXT PRIMARY KEY REFERENCES organizer_funding_requests(id), provider_payment_id TEXT NOT NULL UNIQUE,
      transaction_id TEXT NOT NULL, network TEXT NOT NULL, token TEXT NOT NULL, amount_base_units TEXT NOT NULL,
      received_at TEXT NOT NULL, UNIQUE(network,transaction_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS organizer_funding_outstanding ON organizer_funding_requests(organizer_id,user_id) WHERE state IN ('requested','offered');
    CREATE TRIGGER IF NOT EXISTS organizer_funding_receipts_no_update BEFORE UPDATE ON organizer_funding_receipts BEGIN SELECT RAISE(ABORT,'immutable funding receipt'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_funding_receipts_no_delete BEFORE DELETE ON organizer_funding_receipts BEGIN SELECT RAISE(ABORT,'immutable funding receipt'); END;
  `);
  const stamp = () => new Date(now()).toISOString();
  const userId = (value) => integer(value, 'userId');
  const activeUser = (id) => db.prepare('SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL').get(userId(id));
  const activeOrganizer = (id) => {
    id = userId(id);
    const row = activeUser(id) && db.prepare("SELECT 1 FROM organizer_billing_memberships WHERE user_id=? AND role='organizer' AND active=1 AND julianday(expires_at)>julianday(?)").get(id, stamp());
    if (!row) fail('Active organizer membership required.', 403, 'organizer_inactive');
    return id;
  };
  const select = `SELECT r.*,member.nick user_name,organizer.nick organizer_name FROM organizer_funding_requests r
    JOIN users member ON member.id=r.user_id JOIN users organizer ON organizer.id=r.organizer_id`;
  const rowById = (id) => db.prepare(`${select} WHERE r.id=?`).get(uuid(id, 'funding request id'));
  const result = (row) => row && ({ id: row.id, reference: row.reference, organizerId: row.organizer_id, organizerName: row.organizer_name, userId: row.user_id, userName: row.user_name, amount: row.amount, state: row.state, feeCents: row.fee_cents, paymentLinkId: row.payment_link_id, createdAt: row.created_at, updatedAt: row.updated_at });
  const requireRow = (id) => rowById(id) || fail('Funding request not found.', 404, 'funding_not_found');
  const requireOrganizer = (row, actorId) => {
    actorId = userId(actorId);
    if (row.organizer_id !== actorId) fail('Only the organizer can change this request.', 403, 'organizer_required');
    activeOrganizer(actorId);
  };
  const requireCurrentMember = (row) => {
    if (!activeUser(row.user_id)) fail('Active member required.', 403, 'member_inactive');
    if (!db.prepare("SELECT 1 FROM organizer_club_members WHERE organizer_id=? AND user_id=? AND status='approved'").get(row.organizer_id, row.user_id)) fail('Approved club membership required.', 403, 'member_required');
  };

  function create({ userId: actorId, organizerId, amount, key }) {
    actorId = userId(actorId); organizerId = activeOrganizer(organizerId); amount = integer(amount, 'amount'); key = text(key, 'key');
    if (!activeUser(actorId)) fail('Active member required.', 403, 'member_inactive');
    if (actorId === organizerId) fail('Club owners cannot request funding from themselves.', 409, 'owner_member');
    const old = db.prepare(`${select} WHERE r.user_id=? AND r.idempotency_key=?`).get(actorId, key);
    if (old) {
      if (old.organizer_id !== organizerId || old.amount !== amount) fail('Idempotency key already used with different details.', 409, 'idempotency_conflict');
      return result(old);
    }
    if (!db.prepare("SELECT 1 FROM organizer_club_members WHERE organizer_id=? AND user_id=? AND status='approved'").get(organizerId, actorId)) fail('Approved club membership required.', 403, 'member_required');
    if (db.prepare("SELECT 1 FROM organizer_funding_requests WHERE organizer_id=? AND user_id=? AND state IN ('requested','offered')").get(organizerId, actorId)) fail('An outstanding funding request already exists.', 409, 'outstanding_request');
    const id = randomUUID(), reference = `funding:${randomUUID()}`, ts = stamp();
    db.prepare("INSERT INTO organizer_funding_requests VALUES(?,?,?,?,?,?,'requested',NULL,NULL,?,?)").run(id, reference, organizerId, actorId, amount, key, ts, ts);
    return result(rowById(id));
  }

  function list(actorId) {
    actorId = userId(actorId);
    if (!activeUser(actorId)) fail('Active user required.', 403, 'user_inactive');
    return db.prepare(`${select} WHERE (r.user_id=? OR r.organizer_id=?) AND (r.state IN ('requested','offered') OR r.id IN (
      SELECT id FROM organizer_funding_requests WHERE (user_id=? OR organizer_id=?) AND state NOT IN ('requested','offered') ORDER BY updated_at DESC,id DESC LIMIT 100
    )) ORDER BY r.updated_at DESC,r.id DESC`).all(actorId, actorId, actorId, actorId).map(result);
  }

  function get(actorId, id) {
    actorId = userId(actorId);
    if (!activeUser(actorId)) fail('Active user required.', 403, 'user_inactive');
    const row = requireRow(id);
    if (row.user_id !== actorId && row.organizer_id !== actorId) fail('Funding request not found.', 404, 'funding_not_found');
    return result(row);
  }

  const credit = ({ userId: actorId, id }) => transaction(db, () => {
    const row = requireRow(id); requireOrganizer(row, actorId);
    if (row.state === 'credited') return result(row);
    if (row.state !== 'requested') fail('Only requested funding can be credited.', 409, 'funding_state');
    requireCurrentMember(row);
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `wallet:${row.organizer_id}`, to: `wallet:${row.user_id}`, amount: row.amount, kind: 'funding_credit', reference: `funding:${row.id}:credit` });
    db.prepare("UPDATE organizer_funding_requests SET state='credited',updated_at=? WHERE id=?").run(stamp(), row.id);
    return result(rowById(row.id));
  });

  const offer = ({ userId: actorId, id, feeCents }) => transaction(db, () => {
    const row = requireRow(id); requireOrganizer(row, actorId); feeCents = integer(feeCents, 'feeCents', MAX_FEE_CENTS);
    if (row.state === 'offered') {
      if (row.fee_cents !== feeCents) fail('Funding terms cannot be changed.', 409, 'terms_conflict');
      return result(row);
    }
    if (row.state !== 'requested') fail('Only requested funding can be offered.', 409, 'funding_state');
    requireCurrentMember(row);
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `wallet:${row.organizer_id}`, to: `ticket:funding:${row.id}`, amount: row.amount, kind: 'funding_offer', reference: `funding:${row.id}:offer` });
    db.prepare("UPDATE organizer_funding_requests SET state='offered',fee_cents=?,updated_at=? WHERE id=?").run(feeCents, stamp(), row.id);
    return result(rowById(row.id));
  });

  function attachLink({ userId: actorId, id, paymentLinkId }) {
    const row = requireRow(id); requireOrganizer(row, actorId); paymentLinkId = uuid(paymentLinkId, 'paymentLinkId');
    if (row.state !== 'offered') fail('A paid offer is required.', 409, 'funding_state');
    if (row.payment_link_id) {
      if (row.payment_link_id !== paymentLinkId) fail('Funding terms cannot be changed.', 409, 'terms_conflict');
      return result(row);
    }
    db.prepare('UPDATE organizer_funding_requests SET payment_link_id=?,updated_at=? WHERE id=?').run(paymentLinkId, stamp(), row.id);
    return result(rowById(row.id));
  }

  const settle = ({ userId: actorId, id, payment }) => transaction(db, () => {
    const row = requireRow(id); actorId = userId(actorId);
    if (row.user_id !== actorId && row.organizer_id !== actorId) fail('Only a funding participant can settle this funding.', 403, 'member_required');
    const existing = db.prepare('SELECT * FROM organizer_funding_receipts WHERE request_id=?').get(row.id);
    if (row.state === 'paid') {
      const verified = verifyClubEntryPayment({ id: row.id, reference: row.reference, paymentLinkId: row.payment_link_id, feeCents: row.fee_cents }, payment);
      if (!existing || existing.provider_payment_id !== verified.providerOrderId || existing.transaction_id !== verified.transactionId || existing.network !== verified.network || existing.token !== verified.token || existing.amount_base_units !== verified.amountBaseUnits) fail('Payment receipt conflicts with the settled funding.', 409, 'receipt_conflict');
      return result(row);
    }
    if (row.state !== 'offered' || !row.payment_link_id) fail('An offered funding link is required.', 409, 'funding_state');
    if (actorId === row.organizer_id && !activeUser(actorId)) fail('Active organizer required.', 403, 'organizer_inactive');
    if (!activeUser(row.user_id)) fail('Active member required; reserved chips remain in escrow.', 403, 'member_inactive');
    const verified = verifyClubEntryPayment({ id: row.id, reference: row.reference, paymentLinkId: row.payment_link_id, feeCents: row.fee_cents }, payment);
    if (db.prepare('SELECT 1 FROM organizer_funding_receipts WHERE provider_payment_id=?').get(verified.providerOrderId)) fail('Provider payment is already used.', 409, 'provider_payment_conflict');
    if (db.prepare('SELECT 1 FROM organizer_funding_receipts WHERE network=? AND transaction_id=?').get(verified.network, verified.transactionId)) fail('Network transaction is already used.', 409, 'transaction_conflict');
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='club_entry_payments'").get()) {
      if (db.prepare('SELECT 1 FROM club_entry_payments WHERE provider_order_id=?').get(verified.providerOrderId)) fail('Provider payment is already used.', 409, 'provider_payment_conflict');
      if (db.prepare('SELECT 1 FROM club_entry_payments WHERE network=? AND transaction_id=?').get(verified.network, verified.transactionId)) fail('Network transaction is already used.', 409, 'transaction_conflict');
    }
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `ticket:funding:${row.id}`, to: `wallet:${row.user_id}`, amount: row.amount, kind: 'funding_paid', reference: `funding:${row.id}:paid` });
    db.prepare('INSERT INTO organizer_funding_receipts VALUES(?,?,?,?,?,?,?)').run(row.id, verified.providerOrderId, verified.transactionId, verified.network, verified.token, verified.amountBaseUnits, stamp());
    db.prepare("UPDATE organizer_funding_requests SET state='paid',updated_at=? WHERE id=?").run(stamp(), row.id);
    return result(rowById(row.id));
  });

  function reject({ userId: actorId, id }) {
    const row = requireRow(id); requireOrganizer(row, actorId);
    if (row.state === 'rejected') return result(row);
    if (row.state !== 'requested') fail('Only an unoffered request can be rejected.', 409, 'funding_state');
    db.prepare("UPDATE organizer_funding_requests SET state='rejected',updated_at=? WHERE id=?").run(stamp(), row.id);
    return result(rowById(row.id));
  }

  return { create, list, get, credit, offer, attachLink, settle, reject };
}
