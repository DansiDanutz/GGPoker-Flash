import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createDiamonds, DIAMOND_ISSUANCE_COST } from './diamonds.js';

function fixture({ blocked = false, enabled = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,login TEXT,nick TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT); CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT); CREATE TABLE wallets(org INTEGER,user INTEGER,balance INTEGER,PRIMARY KEY(org,user)); INSERT INTO users VALUES(1,'owner','Owner',0,NULL),(2,'player','Player',0,NULL),(3,'stranger','Stranger',0,NULL),(4,'guest_12345678-abc','Guest',0,NULL); INSERT INTO organizer_billing_memberships VALUES(1,'organizer',1,'2099-01-01T00:00:00.000Z'); INSERT INTO wallets VALUES(1,1,50000),(1,2,10000);`);
  const chips = { moveInTransaction({ organizerId, from, to, amount }) { const id = Number(from.split(':')[1]); const source = db.prepare('SELECT balance FROM wallets WHERE org=? AND user=?').get(organizerId, id); if (!source || source.balance < amount) throw Object.assign(new Error('Insufficient Cash Chips.'), { status: 409 }); db.prepare('UPDATE wallets SET balance=balance-? WHERE org=? AND user=?').run(amount, organizerId, id); if (to.startsWith('wallet:')) db.prepare('UPDATE wallets SET balance=balance+? WHERE org=? AND user=?').run(amount, organizerId, Number(to.split(':')[1])); } };
  const make = mode => createDiamonds({ db, chips, clubs: { canEnter: (org, user) => org === 1 && user === 2 }, now: () => '2026-01-01T00:00:00.000Z', enabled: mode, assertMovementAllowed: () => { if (blocked) throw Object.assign(new Error('Active session credit blocks this movement.'), { status: 409 }); } });
  const service = make(enabled);
  return { db, service, make, balance: id => db.prepare('SELECT balance FROM wallets WHERE org=1 AND user=?').get(id).balance };
}

test('offer, immutable request quote and idempotency conflicts', () => {
  const { service } = fixture();
  const offer = service.offer({ userId: 1, priceCashChips: 2500 }); assert.equal(offer.organizerId, 1); assert.equal(offer.organizerName, 'Owner'); assert.equal(offer.priceCashChips, 2500);
  const request = service.request({ userId: 2, organizerId: 1, quantity: 2, priceCashChips: 2500, key: 'diamond-key-1' });
  assert.equal(service.request({ userId: 2, organizerId: 1, quantity: 2, priceCashChips: 2500, key: 'diamond-key-1' }).id, request.id);
  assert.throws(() => service.request({ userId: 2, organizerId: 1, quantity: 3, priceCashChips: 2500, key: 'diamond-key-1' }), { status: 409 });
  service.offer({ userId: 1, priceCashChips: 3000 });
  assert.equal(service.list(2).requests[0].priceCashChips, 2500);
  assert.throws(() => service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 2500, key: 'diamond-key-2' }), { status: 409 });
});

test('approval atomically burns issuance cost, transfers retail and mints affiliated balance once', () => {
  const { db, service, balance } = fixture(); service.offer({ userId: 1, priceCashChips: 2500 });
  const request = service.request({ userId: 2, organizerId: 1, quantity: 2, priceCashChips: 2500, key: 'diamond-key-1' });
  assert.equal(service.approve({ userId: 1, id: request.id }).state, 'approved');
  assert.equal(balance(1), 50000 - 2 * DIAMOND_ISSUANCE_COST + 5000); assert.equal(balance(2), 5000);
  assert.equal(service.list(2).balances[0].balance, 2);
  assert.deepEqual(service.reconcile(), []); assert.equal(db.prepare('SELECT COUNT(*) n FROM organizer_diamond_issuances').get().n, 1);
  service.approve({ userId: 1, id: request.id }); assert.equal(balance(1), 35000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM organizer_diamond_issuances').get().n, 1);
});

test('insufficient issuance funds and active session guard leave every balance unchanged', () => {
  for (const options of [{}, { blocked: true }]) {
    const { service, balance } = fixture(options); service.offer({ userId: 1, priceCashChips: 2500 });
    const quantity = options.blocked ? 1 : 6, request = service.request({ userId: 2, organizerId: 1, quantity, priceCashChips: 2500, key: `diamond-${quantity}-key` });
    assert.throws(() => service.approve({ userId: 1, id: request.id }), { status: 409 });
    assert.equal(balance(1), 50000); assert.equal(balance(2), 10000); assert.equal(service.list(2).balances.length, 0);
  }
});

test('retail failure rolls back the issuance burn', () => {
  const { service, balance } = fixture(); service.offer({ userId: 1, priceCashChips: 15000 });
  const request = service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 15000, key: 'diamond-retail-fail' });
  assert.throws(() => service.approve({ userId: 1, id: request.id }), { status: 409 });
  assert.equal(balance(1), 50000); assert.equal(balance(2), 10000); assert.equal(service.list(2).balances.length, 0);
});

test('only participants can resolve and reject/cancel never move chips', () => {
  const { service, balance } = fixture(); service.offer({ userId: 1, priceCashChips: 1000 });
  const first = service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 1000, key: 'diamond-reject' });
  assert.throws(() => service.reject({ userId: 3, id: first.id }), { status: 403 }); assert.equal(service.reject({ userId: 1, id: first.id }).state, 'rejected');
  const second = service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 1000, key: 'diamond-cancel' });
  assert.equal(service.cancel({ userId: 2, id: second.id }).state, 'cancelled'); assert.equal(balance(1), 50000); assert.equal(balance(2), 10000);
});

test('disabled mode blocks new approval while expired owners may reject and replay an approval', () => {
  const { db, service, make, balance } = fixture(); service.offer({ userId: 1, priceCashChips: 1000 });
  const pending = service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 1000, key: 'diamond-disabled' });
  assert.throws(() => make(false).approve({ userId: 1, id: pending.id }), { status: 409 }); assert.equal(balance(1), 50000);
  assert.equal(service.approve({ userId: 1, id: pending.id }).state, 'approved');
  db.prepare("UPDATE organizer_billing_memberships SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal(service.approve({ userId: 1, id: pending.id }).state, 'approved');
  db.prepare("UPDATE organizer_billing_memberships SET expires_at='2099-01-01T00:00:00.000Z'").run();
  const rejected = service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 1000, key: 'diamond-expired-reject' });
  db.prepare("UPDATE organizer_billing_memberships SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal(service.reject({ userId: 1, id: rejected.id }).state, 'rejected');
});

test('guests, undated organizer membership and unsafe totals are refused', () => {
  const { db, service } = fixture(); service.offer({ userId: 1, priceCashChips: 1 });
  assert.throws(() => service.list(4), { status: 403 });
  assert.throws(() => service.request({ userId: 4, organizerId: 1, quantity: 1, priceCashChips: 1, key: 'diamond-guest-key' }), { status: 403 });
  assert.throws(() => service.offer({ userId: 1, priceCashChips: 9_000_000_001 }), { status: 400 });
  service.offer({ userId: 1, priceCashChips: 9_000_000_000 });
  assert.throws(() => service.request({ userId: 2, organizerId: 1, quantity: 2, priceCashChips: 9_000_000_000, key: 'diamond-total-key' }), { status: 400 });
  db.prepare('UPDATE organizer_billing_memberships SET expires_at=NULL').run();
  assert.throws(() => service.offer({ userId: 1, priceCashChips: 1 }), { status: 403 });
});

test('reconcile reports balance drift against immutable issuance journal', () => {
  const { db, service } = fixture(); service.offer({ userId: 1, priceCashChips: 1000 });
  const request = service.request({ userId: 2, organizerId: 1, quantity: 1, priceCashChips: 1000, key: 'diamond-reconcile' }); service.approve({ userId: 1, id: request.id });
  db.prepare('UPDATE organizer_diamond_balances SET balance=2').run();
  assert.deepEqual({ ...service.reconcile()[0] }, { organizerId: 1, userId: 2, issued: 1, balance: 2 });
  assert.throws(() => db.prepare('UPDATE organizer_diamond_issuances SET quantity=2').run(), /immutable/);
  assert.throws(() => db.prepare("UPDATE organizer_diamond_requests SET state='made-up'").run(), /invalid diamond request|CHECK constraint/);
  assert.throws(() => db.prepare('UPDATE organizer_diamond_balances SET balance=-1').run(), /invalid diamond balance|CHECK constraint/);
});
