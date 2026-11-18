import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createClubEntryLedger } from './club-entry-ledger.js';

function fixture({ failBonus = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,login TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES(1,'host',0,NULL),(2,'buyer',0,NULL),(3,'creator',0,NULL),(4,'other',0,NULL);
    CREATE TABLE test_clubs(organizer_id INTEGER PRIMARY KEY,fee_cents INTEGER,active INTEGER DEFAULT 1);
    INSERT INTO test_clubs VALUES(1,100,1),(4,100,1);
    CREATE TABLE test_members(organizer_id INTEGER,user_id INTEGER,PRIMARY KEY(organizer_id,user_id));
    CREATE TABLE test_bonus(organizer_id INTEGER,amount INTEGER,reference TEXT UNIQUE,nonredeemable INTEGER);
  `);
  const clubs = {
    profile(organizerId, userId) {
      const club = db.prepare('SELECT * FROM test_clubs WHERE organizer_id=? AND active=1').get(organizerId);
      if (!club) throw Object.assign(new Error('inactive'), { code: 'organizer_inactive' });
      return { entryFeeCents: club.fee_cents, membershipStatus: db.prepare('SELECT 1 FROM test_members WHERE organizer_id=? AND user_id=?').get(organizerId, userId) ? 'approved' : null };
    },
    approvePaid({ organizerId, userId }) { db.prepare('INSERT OR IGNORE INTO test_members VALUES(?,?)').run(organizerId, userId); return { status: 'approved' }; },
  };
  const grantBonus = ({ organizerId, amount, reference, nonredeemable }) => {
    if (failBonus) throw new Error('bonus failed');
    db.prepare('INSERT INTO test_bonus VALUES(?,?,?,?)').run(organizerId, amount, reference, nonredeemable ? 1 : 0);
  };
  let time = Date.parse('2026-02-01T00:00:00.000Z');
  const ledger = createClubEntryLedger({ db, clubs, grantBonus, publisherUserId: 3, merchantId: 'trusted-merchant', now: () => time });
  return { db, clubs, ledger, advance: (ms) => { time += ms; } };
}
const receipt = (order, suffix = '1') => ({ orderId: order.id, providerOrderId: `provider-${suffix}`, transactionId: `tx-${suffix}`, network: 'Polygon', token: 'USDC', amountBaseUnits: '1000000' });

test('$1 settlement records 20/4/16/20 cents and a nonredeemable 6400 Cash Chip bonus', () => {
  const f = fixture(), order = f.ledger.create({ organizerId: 1, userId: 2, paymentLinkId: 'link-1', idempotencyKey: 'create-1' });
  const settled = f.ledger.settle(receipt(order));
  assert.deepEqual(settled.payment, { outcome: 'settled', feeCents: 100, creatorGross20: 20, platformCommission4: 4, creatorNet16: 16, platformRoyaltyCents: 20, organizerBonusChips: 6400, receivedAt: '2026-02-01T00:00:00.000Z' });
  const bonus = f.db.prepare('SELECT amount,nonredeemable FROM test_bonus').get(); assert.equal(bonus.amount, 6400); assert.equal(bonus.nonredeemable, 1);
  assert.equal(f.ledger.earnings(3).netCents, 16); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM test_members').get().n, 1);
});

test('pending pair reuse preserves the original quote after the fee changes and isolates buyers', () => {
  const f = fixture(), first = f.ledger.create({ organizerId: 1, userId: 2, paymentLinkId: 'link-1', idempotencyKey: 'one' });
  f.db.prepare('UPDATE test_clubs SET fee_cents=999 WHERE organizer_id=1').run();
  const retry = f.ledger.create({ organizerId: 1, userId: 2, paymentLinkId: 'link-2', idempotencyKey: 'two' });
  assert.equal(retry.id, first.id); assert.equal(retry.feeCents, 100); assert.equal(retry.paymentLinkId, 'link-1');
  assert.throws(() => f.ledger.get(first.id, 4), (e) => e.code === 'order_not_found');
  assert.notEqual(f.ledger.create({ organizerId: 1, userId: 4, paymentLinkId: 'link-3', idempotencyKey: 'three' }).id, first.id);
});

test('callback failure rolls back payment, earning, membership, and bonus atomically', () => {
  const f = fixture({ failBonus: true }), order = f.ledger.create({ organizerId: 1, userId: 2, paymentLinkId: 'link', idempotencyKey: 'one' });
  assert.throws(() => f.ledger.settle(receipt(order)), /bonus failed/);
  for (const table of ['club_entry_payments','club_creator_earnings','test_members','test_bonus']) assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  assert.equal(f.ledger.get(order.id, 2).status, 'pending');
});

test('receipt replay is a no-op and chain or provider receipt reuse conflicts without double credit', () => {
  const f = fixture(), one = f.ledger.create({ organizerId: 1, userId: 2, paymentLinkId: 'one', idempotencyKey: 'one' });
  assert.equal(f.ledger.settle(receipt(one)).applied, true); assert.equal(f.ledger.settle(receipt(one)).applied, false);
  const two = f.ledger.create({ organizerId: 4, userId: 2, paymentLinkId: 'two', idempotencyKey: 'two' });
  assert.throws(() => f.ledger.settle({ ...receipt(two, '2'), providerOrderId: 'provider-1' }), (e) => e.code === 'provider_order_conflict');
  assert.throws(() => f.ledger.settle({ ...receipt(two, '2'), transactionId: 'tx-1' }), (e) => e.code === 'transaction_conflict');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM test_bonus').get().n, 1); assert.equal(f.ledger.earnings(3).orders, 1);
});

test('inactive or already-approved receipts are retained as refund_required with no bonus or earnings', () => {
  for (const reason of ['payer', 'organizer', 'member']) {
    const f = fixture(), order = f.ledger.create({ organizerId: 1, userId: 2, paymentLinkId: reason, idempotencyKey: reason });
    if (reason === 'payer') f.db.prepare('UPDATE users SET banned=1 WHERE id=2').run();
    if (reason === 'organizer') f.db.prepare('UPDATE test_clubs SET active=0 WHERE organizer_id=1').run();
    if (reason === 'member') f.db.prepare('INSERT INTO test_members VALUES(1,2)').run();
    const result = f.ledger.settle(receipt(order, reason));
    assert.equal(result.payment.outcome, 'refund_required'); assert.equal(result.order.status, 'refund_required');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM test_bonus').get().n, 0); assert.equal(f.ledger.earnings(3).orders, 0);
  }
});
