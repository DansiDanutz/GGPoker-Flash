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
  const grantBonus = ({ organizerId, amountCents, reference, nonredeemable }) => {
    if (failBonus) throw new Error('bonus failed');
    db.prepare('INSERT INTO test_bonus VALUES(?,?,?,?)').run(organizerId, amountCents, reference, nonredeemable ? 1 : 0);
  };
  let time = Date.parse('2026-02-01T00:00:00.000Z');
  const ledger = createClubEntryLedger({ db, clubs, grantBonus, publisherUserId: 3, merchantId: 'trusted-merchant', now: () => time });
  return { db, clubs, ledger, advance: (ms) => { time += ms; } };
}
const receipt = (order, suffix = '1') => ({ orderId: order.id, providerOrderId: `provider-${suffix}`, paidAt: order.createdAt, transactionId: `tx-${suffix}`, network: 'Polygon', token: 'USDC', amountBaseUnits: '1000000' });

test('$1 settlement records 20/4/16/20 cents and 64 cents of organizer fee credit', () => {
  const f = fixture(), order = f.ledger.create({ organizerId: 1, userId: 2, quotedFeeCents: 100, paymentLinkId: 'link-1', idempotencyKey: 'create-1' });
  const settled = f.ledger.settle(receipt(order));
  assert.deepEqual(settled.payment, { outcome: 'settled', feeCents: 100, creatorGross20: 20, platformCommission4: 4, creatorNet16: 16, platformRoyaltyCents: 20, organizerBonusChips: 0, organizerFeeCreditCents: 64, receivedAt: '2026-02-01T00:00:00.000Z' });
  const bonus = f.db.prepare('SELECT amount,nonredeemable FROM test_bonus').get(); assert.equal(bonus.amount, 64); assert.equal(bonus.nonredeemable, 1);
  assert.equal(f.ledger.earnings(3).netCents, 16); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM test_members').get().n, 1);
});

test('pending pair reuse preserves the original quote after the fee changes and isolates buyers', () => {
  const f = fixture(), first = f.ledger.create({ organizerId: 1, userId: 2, quotedFeeCents: 100, paymentLinkId: 'link-1', idempotencyKey: 'one' });
  f.db.prepare('UPDATE test_clubs SET fee_cents=975 WHERE organizer_id=1').run();
  const retry = f.ledger.create({ organizerId: 1, userId: 2, quotedFeeCents: 975, paymentLinkId: 'link-2', idempotencyKey: 'two' });
  assert.equal(retry.id, first.id); assert.equal(retry.feeCents, 100); assert.equal(retry.paymentLinkId, 'link-1');
  assert.throws(() => f.ledger.get(first.id, 4), (e) => e.code === 'order_not_found');
  assert.notEqual(f.ledger.create({ organizerId: 1, userId: 4, quotedFeeCents: 975, paymentLinkId: 'link-3', idempotencyKey: 'three' }).id, first.id);
});

test('callback failure rolls back payment, earning, membership, and bonus atomically', () => {
  const f = fixture({ failBonus: true }), order = f.ledger.create({ organizerId: 1, userId: 2, quotedFeeCents: 100, paymentLinkId: 'link', idempotencyKey: 'one' });
  assert.throws(() => f.ledger.settle(receipt(order)), /bonus failed/);
  for (const table of ['club_entry_payments','club_creator_earnings','test_members','test_bonus']) assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  assert.equal(f.ledger.get(order.id, 2).status, 'pending');
});

test('receipt replay is a no-op and chain or provider receipt reuse conflicts without double credit', () => {
  const f = fixture(), one = f.ledger.create({ organizerId: 1, userId: 2, quotedFeeCents: 100, paymentLinkId: 'one', idempotencyKey: 'one' });
  assert.equal(f.ledger.settle(receipt(one)).applied, true); assert.equal(f.ledger.settle(receipt(one)).applied, false);
  const two = f.ledger.create({ organizerId: 4, userId: 2, quotedFeeCents: 100, paymentLinkId: 'two', idempotencyKey: 'two' });
  assert.throws(() => f.ledger.settle({ ...receipt(two, '2'), providerOrderId: 'provider-1' }), (e) => e.code === 'provider_order_conflict');
  assert.throws(() => f.ledger.settle({ ...receipt(two, '2'), transactionId: 'tx-1' }), (e) => e.code === 'transaction_conflict');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM test_bonus').get().n, 1); assert.equal(f.ledger.earnings(3).orders, 1);
});

test('inactive or already-approved receipts are retained as refund_required with no bonus or earnings', () => {
  for (const reason of ['payer', 'organizer', 'member']) {
    const f = fixture(), order = f.ledger.create({ organizerId: 1, userId: 2, quotedFeeCents: 100, paymentLinkId: reason, idempotencyKey: reason });
    if (reason === 'payer') f.db.prepare('UPDATE users SET banned=1 WHERE id=2').run();
    if (reason === 'organizer') f.db.prepare('UPDATE test_clubs SET active=0 WHERE organizer_id=1').run();
    if (reason === 'member') f.db.prepare('INSERT INTO test_members VALUES(1,2)').run();
    const result = f.ledger.settle(receipt(order, reason));
    assert.equal(result.payment.outcome, 'refund_required'); assert.equal(result.order.status, 'refund_required');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM test_bonus').get().n, 0); assert.equal(f.ledger.earnings(3).orders, 0);
  }
});

test('a link selected before a fee change cannot create a mismatched order', () => {
  const f = fixture(), quote = { organizerId: 1, userId: 2, quotedFeeCents: 100, paymentLinkId: 'link-100', idempotencyKey: 'quote' };
  f.db.exec('UPDATE test_clubs SET fee_cents=250 WHERE organizer_id=1');
  assert.throws(() => f.ledger.create(quote), e => e.code === 'club_price_changed');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM club_entry_orders').get().n, 0);
  const fresh = f.ledger.create({ ...quote, quotedFeeCents: 250, paymentLinkId: 'link-250' });
  assert.deepEqual([fresh.feeCents, fresh.paymentLinkId], [250, 'link-250']);
});

test('expired quotes can be replaced; provider payment time decides late verification', () => {
  for (const [paidAt, outcome] of [['2026-02-01T23:59:59Z','settled'], ['2026-02-02T00:00:00Z','refund_required']]) {
    const f = fixture(), args = { organizerId:1, userId:2, quotedFeeCents:100, paymentLinkId:'link', idempotencyKey:'first' };
    const old = f.ledger.create(args);
    // Reopen with the historical unique pending-pair index and the original order intact.
    f.db.exec("DROP INDEX club_entry_pending_recent; CREATE UNIQUE INDEX club_entry_pending_pair ON club_entry_orders(organizer_id,user_id) WHERE status='pending'");
    createClubEntryLedger({db:f.db,clubs:f.clubs,grantBonus:()=>{},publisherUserId:3,merchantId:'trusted-merchant'});
    f.advance(86400000);
    const fresh = f.ledger.create({...args,idempotencyKey:'second'});
    assert.notEqual(fresh.id,old.id);
    assert.equal(f.ledger.get(old.id,2).status,'expired');
    const evidence = {...receipt(old),paidAt};
    assert.equal(f.ledger.settle(evidence).payment.outcome,outcome);
    assert.equal(f.ledger.settle(evidence).applied,false);
    assert.equal(f.db.prepare('SELECT count(*) n FROM test_bonus').get().n,Number(outcome==='settled'));
  }
});

test('upgrade replaces an old unpaid quote but honors its original payment terms', () => {
  const f = fixture();
  f.db.exec("DROP INDEX club_entry_pending_recent; CREATE UNIQUE INDEX club_entry_pending_pair ON club_entry_orders(organizer_id,user_id) WHERE status='pending'");
  if (f.db.prepare("SELECT 1 FROM pragma_table_info('club_entry_orders') WHERE name='expires_at'").get()) f.db.exec('ALTER TABLE club_entry_orders DROP COLUMN expires_at');
  f.db.exec("INSERT INTO club_entry_orders VALUES('legacy','legacy-ref',1,2,3,'trusted-merchant',5,'old-link','old-key','pending','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')");
  const ledger = createClubEntryLedger({db:f.db,clubs:f.clubs,grantBonus:()=>{},publisherUserId:3,merchantId:'trusted-merchant',now:()=>Date.parse('2026-02-01T00:00:00Z')});
  const fresh = ledger.create({organizerId:1,userId:2,quotedFeeCents:100,paymentLinkId:'fresh-link',idempotencyKey:'fresh'});
  assert.notEqual(fresh.id,'legacy');
  const paid = {...receipt(ledger.get('legacy',2)),amountBaseUnits:'50000',paidAt:'2026-01-20T00:00:00Z'};
  const {payment} = ledger.settle(paid);
  assert.deepEqual([payment.outcome,payment.feeCents,payment.creatorNet16,payment.platformRoyaltyCents,payment.organizerFeeCreditCents],['settled',5,1,0,4]);
  assert.equal(ledger.settle(paid).applied,false);
});

test('new paid quotes must represent the full split in whole cents', () => {
  for (const fee of [1, 4, 5, 6, 24, 25, 26, 75, 100000]) {
    const f = fixture();
    f.db.prepare('UPDATE test_clubs SET fee_cents=? WHERE organizer_id=1').run(fee);
    const quote = () => f.ledger.create({organizerId:1,userId:2,quotedFeeCents:fee,paymentLinkId:'link',idempotencyKey:'tier'});
    if (fee % 25) { assert.throws(quote,e=>e.code==='fee_invalid'); continue; }
    const order = quote(), {payment} = f.ledger.settle({...receipt(order),amountBaseUnits:String(fee*10000)});
    assert.deepEqual([payment.creatorNet16,payment.platformRoyaltyCents,payment.organizerFeeCreditCents],[fee*16/100,fee/5,fee*64/100]);
  }
});
