// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES (1,0,NULL),(2,0,NULL),(3,0,NULL),(4,0,NULL);
    CREATE TABLE organizer_billing_accounts(user_id INTEGER PRIMARY KEY,balance_cents INTEGER NOT NULL CHECK(balance_cents>=0));
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    CREATE TABLE organizer_billing_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,kind TEXT,amount_cents INTEGER,reference TEXT UNIQUE,resource_id TEXT,metadata TEXT,created_at TEXT);
    INSERT INTO organizer_billing_accounts VALUES (1,1000),(2,1000);
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2099-01-01T00:00:00.000Z'),(2,'organizer',1,'2099-01-01T00:00:00.000Z');
    CREATE TABLE tables(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,chip_economy INTEGER);
    INSERT INTO tables VALUES ('t1',1,1,1),('t2',1,1,1),('spin:owned:1',1,1,1),('wrong-owner',2,1,1),('public',1,0,1),('play',1,1,0);
  `);
  let time = Date.parse('2026-01-01T00:00:00Z');
  const result = { db, advance: (ms) => { time += ms; } };
  result.chips = createOrganizerChips({ db, now: () => time });
  return result;
}
function grant(f, organizerId = 1, reference = 'paid-membership') {
  f.db.exec('BEGIN IMMEDIATE');
  try { const result = f.chips.grantMembership({ organizerId, reference }); f.db.exec('COMMIT'); return result; }
  catch (error) { f.db.exec('ROLLBACK'); throw error; }
}

test('membership grants once, pack purchase debits service credits, and supply is conserved', () => {
  const f = fixture();
  assert.equal(grant(f).applied, true); assert.equal(grant(f).applied, false);
  assert.deepEqual(f.chips.purchase({ organizerId: 1, packs: 2, idempotencyKey: 'packs-1' }), { packs: 2, chips: 20000, service_cents: 200, balance: 120000 });
  assert.deepEqual(f.chips.purchase({ organizerId: 1, packs: 2, idempotencyKey: 'packs-1' }), { packs: 2, chips: 20000, service_cents: 200, balance: 120000, applied: false });
  assert.equal(f.db.prepare('SELECT balance_cents FROM organizer_billing_accounts WHERE user_id=1').get().balance_cents, 800);
  assert.deepEqual(f.chips.supply(1), { minted: 120000, burned: 0, circulating: 120000 });
  assert.throws(() => f.chips.purchase({ organizerId: 1, packs: 3, idempotencyKey: 'packs-1' }), (e) => e.code === 'idempotency_conflict');
});

test('early renewal grant releases once when its period begins', () => {
  const f = fixture(), due = '2026-02-01T00:00:00.000Z';
  f.db.exec('BEGIN IMMEDIATE');
  const scheduled = f.chips.grantMembership({ organizerId: 1, reference: 'renewal-2', availableAt: due });
  f.db.exec('COMMIT');
  assert.deepEqual(scheduled, { applied: false, pending: true, available_at: due }); assert.equal(f.chips.balance(1, 1), 0);
  assert.equal(f.chips.releaseDueGrants(), 0); f.advance(31 * 86400000); assert.equal(f.chips.releaseDueGrants(), 1);
  assert.equal(f.chips.releaseDueGrants(), 0); assert.equal(f.chips.balance(1, 1), 100000);
});

test('wallets cannot spend free chips and organizer ledgers stay isolated', () => {
  const f = fixture(); grant(f, 1, 'one'); grant(f, 2, 'two');
  f.chips.transfer({ organizerId: 1, fromUserId: 1, toUserId: 3, amount: 5000, idempotencyKey: 'give' });
  assert.equal(f.chips.balance(1, 3), 5000); assert.equal(f.chips.balance(2, 3), 0);
  assert.throws(() => f.chips.transfer({ organizerId: 2, fromUserId: 3, toUserId: 4, amount: 1, idempotencyKey: 'steal' }), (e) => e.code === 'insufficient_chips');
  assert.throws(() => f.chips.transfer({ organizerId: 1, fromUserId: 1, toUserId: 4, amount: 10, idempotencyKey: 'give' }), (e) => e.code === 'idempotency_conflict');
  assert.throws(() => f.chips.move({ organizerId: 1, from: null, to: 'wallet:4', amount: 10, kind: 'fake', reference: 'fake' }));
  f.chips.move({ organizerId: 1, from: 'wallet:1', to: 'burn', amount: 1, kind: 'test_burn', reference: 'burn-1' });
  assert.throws(() => f.chips.move({ organizerId: 1, from: 'burn', to: 'wallet:1', amount: 1, kind: 'unburn', reference: 'unburn-1' }), (e) => e.code === 'burn_immutable');
  assert.throws(() => f.db.prepare("UPDATE organizer_chip_accounts SET balance=0 WHERE organizer_id=1 AND account_key='burn'").run(), /burn balance cannot decrease/);
});

test('active session credit locks borrower wallet movements except cash seats', () => {
  const f = fixture(); grant(f);
  f.db.exec(`CREATE TABLE organizer_session_credits(id TEXT PRIMARY KEY,funding_request_id TEXT,organizer_id INTEGER,user_id INTEGER,state TEXT);
    INSERT INTO organizer_session_credits VALUES ('loan-1','fund-1',1,3,'active')`);
  assert.throws(() => f.chips.transfer({ organizerId: 1, fromUserId: 1, toUserId: 3, amount: 10, idempotencyKey: 'locked-in' }), (error) => error.code === 'session_credit_locked');
  f.db.prepare('INSERT INTO organizer_chip_accounts VALUES (?,?,?)').run(1, 'wallet:3', 100);
  assert.equal(f.chips.openSeat({ organizerId: 1, userId: 3, tableId: 't1', sessionId: 'credit-seat', amount: 100 }).applied, true);
  f.db.prepare("UPDATE tables SET private=0 WHERE id='t1'").run();
  assert.equal(f.chips.recoverSessions().length, 1); assert.equal(f.chips.balance(1, 3), 100);
  f.db.exec("CREATE TABLE tournaments(id TEXT PRIMARY KEY); INSERT INTO tournaments VALUES('t2')");
  assert.throws(() => f.chips.openSeat({ organizerId: 1, userId: 3, tableId: 't2', sessionId: 'credit-tourney', amount: 10 }), (error) => error.code === 'session_credit_locked');
  assert.throws(() => f.chips.transfer({ organizerId: 1, fromUserId: 3, toUserId: 4, amount: 10, idempotencyKey: 'locked-out' }), (error) => error.code === 'session_credit_locked');
});

test('seat APIs reject public, play-money, and other-organizer tables', () => {
  const f = fixture(); grant(f);
  for (const tableId of ['wrong-owner', 'public', 'play', 'missing']) {
    assert.throws(() => f.chips.openSeat({ organizerId: 1, userId: 1, tableId, sessionId: `bad:${tableId}`, amount: 10 }), (e) => e.code === 'chip_table_ineligible');
  }
});

test('cash escrow settles atomically, burns rake, replays strictly, and closes exactly once', () => {
  const f = fixture(); grant(f);
  f.chips.transfer({ organizerId: 1, fromUserId: 1, toUserId: 3, amount: 10000, idempotencyKey: 'fund-3' });
  f.chips.openSeat({ organizerId: 1, userId: 1, tableId: 't1', sessionId: 's1', amount: 10000 });
  f.chips.openSeat({ organizerId: 1, userId: 3, tableId: 't1', sessionId: 's3', amount: 10000 });
  assert.deepEqual(f.chips.reconcileTable(1, 't1'), { escrow: 20000, held: 20000, reconciled: true });
  const settled = f.chips.settleHand({ organizerId: 1, tableId: 't1', handId: 'h1', players: [{ sessionId: 's1', userId: 1, amount: 14900 }, { sessionId: 's3', userId: 3, amount: 5000 }], rake: 100 });
  assert.equal(settled.applied, true); assert.equal(f.chips.settleHand({ organizerId: 1, tableId: 't1', handId: 'h1', players: [{ sessionId: 's3', userId: 3, amount: 5000 }, { sessionId: 's1', userId: 1, amount: 14900 }], rake: 100 }).applied, false);
  assert.throws(() => f.chips.settleHand({ organizerId: 1, tableId: 't1', handId: 'h1', players: [{ sessionId: 's1', userId: 1, amount: 14901 }, { sessionId: 's3', userId: 3, amount: 4999 }], rake: 100 }), (e) => e.code === 'idempotency_conflict');
  assert.deepEqual(f.chips.reconcileTable(1, 't1'), { escrow: 19900, held: 19900, reconciled: true });
  assert.equal(f.chips.closeSeat({ organizerId: 1, userId: 3, tableId: 't1', sessionId: 's3' }).applied, true);
  assert.equal(f.chips.closeSeat({ organizerId: 1, userId: 3, tableId: 't1', sessionId: 's3' }).applied, false);
  assert.deepEqual(f.chips.supply(1), { minted: 100000, burned: 100, circulating: 99900 });
});

test('seat changes roll back on failure and crash recovery refunds stored holdings without minting', () => {
  const f = fixture(); grant(f);
  f.chips.openSeat({ organizerId: 1, userId: 1, tableId: 't2', sessionId: 's2', amount: 1000 });
  assert.throws(() => f.chips.seatMove({ organizerId: 1, userId: 1, tableId: 't2', sessionId: 's2', kind: 'remove', amount: 1001, reference: 'too-much' }), (e) => e.code === 'insufficient_chips');
  assert.deepEqual(f.chips.reconcileTable(1, 't2'), { escrow: 1000, held: 1000, reconciled: true });
  f.chips.seatMove({ organizerId: 1, userId: 1, tableId: 't2', sessionId: 's2', kind: 'rebuy', amount: -500, reference: 'rebuy-1' });
  assert.deepEqual(f.chips.reconcileTable(1, 't2'), { escrow: 1500, held: 1500, reconciled: true });
  f.db.prepare('UPDATE users SET banned=1 WHERE id=1').run();
  assert.equal(f.chips.recoverSessions().length, 1); assert.equal(f.chips.balance(1, 1), 100000);
  assert.equal(f.chips.recoverSessions().length, 0); assert.deepEqual(f.chips.supply(1), { minted: 100000, burned: 0, circulating: 100000 });
});

test('closeSeat refunds an existing banned player on its persisted organizer table', () => {
  const f = fixture(); grant(f); f.chips.transfer({ organizerId: 1, fromUserId: 1, toUserId: 3, amount: 1000, idempotencyKey: 'banned-fund' });
  f.chips.openSeat({ organizerId: 1, userId: 3, tableId: 't2', sessionId: 'banned-seat', amount: 1000 });
  f.db.prepare('UPDATE users SET banned=1 WHERE id=3').run();
  assert.equal(f.chips.closeSeat({ organizerId: 1, userId: 3, tableId: 't2', sessionId: 'banned-seat' }).applied, true);
  assert.equal(f.chips.balance(1, 3), 1000);
});

test('seat movement accepts a bounded composed reference with realistic UUID keys', () => {
  const f = fixture(), sessionId = `spin:${crypto.randomUUID()}:${'s'.repeat(100)}`, rebuyKey = `${crypto.randomUUID()}:${'r'.repeat(100)}`;
  grant(f); f.chips.openSeat({ organizerId: 1, userId: 1, tableId: 'spin:owned:1', sessionId, amount: 5000 });
  assert.equal(f.chips.seatMove({ organizerId: 1, userId: 1, tableId: 'spin:owned:1', sessionId, kind: 'rebuy', amount: -1, reference: rebuyKey }).applied, true);
});
