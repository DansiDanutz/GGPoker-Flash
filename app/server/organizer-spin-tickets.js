// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value) { if (typeof value !== 'string' || !/^[\w:.\-]{1,160}$/.test(value)) fail('Invalid ticket identifier or operation key.'); return value; }

export function createOrganizerSpinTickets({ db, chips }) {
  db.exec(`CREATE TABLE IF NOT EXISTS organizer_chip_spin_tickets (
    id TEXT PRIMARY KEY, organizer_id INTEGER NOT NULL, table_id TEXT NOT NULL, holder_id INTEGER NOT NULL,
    price INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('issued','consumed','refunded')),
    session_id TEXT UNIQUE, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS organizer_spin_ticket_holder ON organizer_chip_spin_tickets(holder_id,table_id,state);
  CREATE TABLE IF NOT EXISTS organizer_spin_ticket_operations (
    actor_id INTEGER NOT NULL, operation_key TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(actor_id,operation_key)
  );`);
  const transaction = fn => {
    if (db.isTransaction) return fn();
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const active = userId => { if (!Number.isSafeInteger(userId) || userId < 1 || !db.prepare('SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL').get(userId)) fail('Active user required.', 403); };
  const eligible = tableId => {
    const t = db.prepare("SELECT * FROM tables WHERE id=? AND enabled=1 AND private=1 AND chip_economy=1 AND game='spingold'").get(text(tableId));
    if (!t) fail('Eligible Cash Chip Spin table required.', 409);
    return t;
  };
  const held = (userId, ticketId) => {
    active(userId); const t = db.prepare('SELECT * FROM organizer_chip_spin_tickets WHERE id=? AND holder_id=?').get(text(ticketId), userId);
    if (!t) fail('Spin ticket not found.', 404); return t;
  };
  const operation = (userId, key, payload, fn) => transaction(() => {
    active(userId); text(key); payload = JSON.stringify(payload);
    const old = db.prepare('SELECT * FROM organizer_spin_ticket_operations WHERE actor_id=? AND operation_key=?').get(userId, key);
    if (old) { if (old.payload !== payload) fail('Operation key already used with different details.', 409); return JSON.parse(old.result); }
    const r = fn(); db.prepare('INSERT INTO organizer_spin_ticket_operations VALUES (?,?,?,?)').run(userId, key, payload, JSON.stringify(r)); return r;
  });
  const issue = ({ userId, tableId, key }) => operation(userId, key, ['issue', tableId], () => {
    const t = eligible(tableId), id = randomUUID();
    chips.assertSessionCreditUnlocked(t.owner_id, userId);
    active(t.owner_id);
    const membership = db.prepare("SELECT expires_at FROM organizer_billing_memberships WHERE user_id=? AND role='organizer' AND active=1").get(t.owner_id);
    if (!membership || Date.parse(membership.expires_at) <= Date.now()) fail('Active organiser membership required to sell new tickets.', 402);
    chips.moveInTransaction({ organizerId: t.owner_id, from: `wallet:${userId}`, to: `ticket:${id}`, amount: t.min_buyin, kind: 'spin_ticket_issue', reference: `spin-ticket:${id}:issue` });
    db.prepare("INSERT INTO organizer_chip_spin_tickets VALUES (?,?,?,?,?,'issued',NULL,?)").run(id, t.owner_id, t.id, userId, t.min_buyin, new Date().toISOString());
    return { id };
  });
  const transfer = ({ userId, ticketId, toUserId, key }) => operation(userId, key, ['transfer', ticketId, toUserId], () => {
    active(toUserId); const t = held(userId, ticketId);
    if (t.state !== 'issued' || userId === toUserId) fail('Choose another holder for an unused ticket.', 409);
    chips.assertSessionCreditUnlocked(t.organizer_id, userId, toUserId);
    db.prepare('UPDATE organizer_chip_spin_tickets SET holder_id=? WHERE id=?').run(toUserId, t.id); return { id: t.id, holder_id: toUserId };
  });
  const refundRow = t => {
    if (t.state === 'refunded') return { id: t.id, state: t.state };
    if (t.state !== 'issued') fail('Only unused tickets can be refunded.', 409);
    chips.assertSessionCreditUnlocked(t.organizer_id, t.holder_id);
    chips.moveInTransaction({ organizerId: t.organizer_id, from: `ticket:${t.id}`, to: `wallet:${t.holder_id}`, amount: t.price, kind: 'spin_ticket_refund', reference: `spin-ticket:${t.id}:refund` });
    db.prepare("UPDATE organizer_chip_spin_tickets SET state='refunded' WHERE id=?").run(t.id); return { id: t.id, state: 'refunded' };
  };
  const refund = ({ userId, ticketId }) => transaction(() => refundRow(held(userId, ticketId)));
  const refundTable = tableId => transaction(() => db.prepare("SELECT * FROM organizer_chip_spin_tickets WHERE table_id=? AND state='issued'").all(text(tableId)).map(refundRow));
  const available = (userId, tableId) => db.prepare("SELECT * FROM organizer_chip_spin_tickets WHERE holder_id=? AND table_id=? AND state='issued' ORDER BY created_at,id LIMIT 1").get(userId, tableId);
  const openSeat = details => transaction(() => {
    const { userId, tableId, organizerId, amount, sessionId } = details;
    active(userId); const cfg = eligible(tableId), t = available(userId, tableId);
    chips.assertSessionCreditUnlocked(organizerId, userId);
    if (cfg.owner_id !== organizerId || amount !== cfg.min_buyin || amount !== cfg.max_buyin) fail('Spin entry terms changed.', 409);
    if (db.prepare('SELECT 1 FROM organizer_chip_sessions WHERE organizer_id=? AND session_id=?').get(organizerId, sessionId)) return chips.openSeat(details);
    if (t) {
      if (t.organizer_id !== organizerId || t.price !== amount) fail('Spin ticket terms changed.', 409);
      // Both movements commit together; no intermediate spendable wallet credit is exposed.
      chips.moveInTransaction({ organizerId, from: `ticket:${t.id}`, to: `wallet:${userId}`, amount, kind: 'spin_ticket_redeem', reference: `spin-ticket:${t.id}:redeem` });
    }
    const result = chips.openSeat(details);
    if (t) db.prepare("UPDATE organizer_chip_spin_tickets SET state='consumed',session_id=? WHERE id=?").run(sessionId, t.id);
    return result;
  });
  const list = userId => db.prepare('SELECT * FROM organizer_chip_spin_tickets WHERE holder_id=? ORDER BY created_at DESC LIMIT 100').all(userId);
  return { issue, transfer, refund, refundTable, available, openSeat, list };
}
