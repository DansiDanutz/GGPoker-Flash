// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerFunding } from './organizer-funding.js';

const LINK = '11111111-1111-4111-8111-111111111111';
const PAYMENT = { id: '22222222-2222-4222-8222-222222222222', status: 'paid', test: false, network: 'polygon', currencyToken: 'USDC', amountBaseUnits: '25000000', amountReceivedBaseUnits: '25000000', transactionId: '0xfunding', paidAt: '2026-01-02T00:00:00Z', recipientWallet: '0xmerchant' };

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,nick TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES (1,'Owner',0,NULL),(2,'Member',0,NULL),(3,'Pending',0,NULL),(4,'Inactive owner',0,NULL);
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2099-01-01T00:00:00.000Z'),(4,'organizer',0,'2099-01-01T00:00:00.000Z');
    CREATE TABLE organizer_club_members(organizer_id INTEGER,user_id INTEGER,status TEXT,message TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(organizer_id,user_id));
    INSERT INTO organizer_club_members VALUES (1,2,'approved','','',''),(1,3,'pending','','',''),(4,2,'approved','','','');
  `);
  const now = () => Date.parse('2026-01-01T00:00:00Z');
  const chips = createOrganizerChips({ db, now });
  db.prepare('INSERT INTO organizer_chip_accounts VALUES (?,?,?)').run(1, 'wallet:1', 50_000);
  return { db, chips, funding: createOrganizerFunding({ db, chips, now }) };
}

test('approved member creates once, conflicting keys fail, and only participants can list', () => {
  const f = fixture();
  const request = f.funding.create({ userId: 2, organizerId: 1, amount: 20_000, key: 'request-1' });
  assert.equal(request.state, 'requested');
  assert.match(request.id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(f.funding.create({ userId: 2, organizerId: 1, amount: 20_000, key: 'request-1' }), request);
  assert.throws(() => f.funding.create({ userId: 2, organizerId: 1, amount: 20_001, key: 'request-1' }), (error) => error.code === 'idempotency_conflict');
  assert.throws(() => f.funding.create({ userId: 3, organizerId: 1, amount: 1, key: 'not-approved' }), (error) => error.code === 'member_required');
  assert.throws(() => f.funding.create({ userId: 2, organizerId: 4, amount: 1, key: 'inactive-owner' }), (error) => error.code === 'organizer_inactive');
  assert.throws(() => f.funding.create({ userId: 1, organizerId: 1, amount: 1, key: 'self' }), (error) => error.code === 'owner_member');
  assert.throws(() => f.funding.create({ userId: 2, organizerId: 1, amount: 20_000, key: 'request-2' }), (error) => error.code === 'outstanding_request');
  assert.equal(f.funding.list(2).length, 1);
  assert.equal(f.funding.list(2)[0].organizerName, 'Owner');
  assert.equal(f.funding.list(2)[0].userName, 'Member');
  assert.equal(f.funding.list(1).length, 1);
  assert.equal(f.funding.list(3).length, 0);
  assert.equal(f.funding.get(2, request.id).id, request.id);
  assert.equal(f.funding.get(1, request.id).id, request.id);
  assert.throws(() => f.funding.get(3, request.id), (error) => error.code === 'funding_not_found');
});

test('organizer can credit directly once with strict ownership and conserved chips', () => {
  const f = fixture(), request = f.funding.create({ userId: 2, organizerId: 1, amount: 20_000, key: 'credit-me' });
  assert.throws(() => f.funding.credit({ userId: 2, id: request.id }), (error) => error.code === 'organizer_required');
  const credited = f.funding.credit({ userId: 1, id: request.id });
  assert.equal(credited.state, 'credited');
  assert.equal(f.funding.credit({ userId: 1, id: request.id }).state, 'credited');
  assert.equal(f.chips.balance(1, 1), 30_000);
  assert.equal(f.chips.balance(1, 2), 20_000);
  assert.equal(f.chips.supply(1).circulating, 0);
});

test('paid offer reserves chips, settles verified payment once, and rejects receipt reuse', () => {
  const f = fixture(), request = f.funding.create({ userId: 2, organizerId: 1, amount: 20_000, key: 'paid-request' });
  const offered = f.funding.offer({ userId: 1, id: request.id, feeCents: 2500 });
  assert.equal(offered.state, 'offered');
  assert.equal(f.chips.balance(1, 1), 30_000);
  assert.equal(f.db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=1 AND account_key=?').get(`ticket:funding:${request.id}`).balance, 20_000);
  assert.deepEqual(f.funding.offer({ userId: 1, id: request.id, feeCents: 2500 }), offered);
  assert.throws(() => f.funding.offer({ userId: 1, id: request.id, feeCents: 2501 }), (error) => error.code === 'terms_conflict');
  assert.throws(() => f.funding.reject({ userId: 1, id: request.id }), (error) => error.code === 'funding_state');
  f.funding.attachLink({ userId: 1, id: request.id, paymentLinkId: LINK });
  assert.throws(() => f.funding.attachLink({ userId: 1, id: request.id, paymentLinkId: '33333333-3333-4333-8333-333333333333' }), (error) => error.code === 'terms_conflict');
  const payment = { ...PAYMENT, customerReference: offered.reference, paymentLinkId: LINK };
  const paid = f.funding.settle({ userId: 2, id: request.id, payment });
  assert.equal(paid.state, 'paid');
  assert.equal(f.funding.settle({ userId: 2, id: request.id, payment }).state, 'paid');
  assert.equal(f.chips.balance(1, 2), 20_000);
  assert.equal(f.db.prepare('SELECT SUM(balance) total FROM organizer_chip_accounts WHERE organizer_id=1').get().total, 50_000);
  assert.equal(f.db.prepare('SELECT COUNT(*) count FROM organizer_funding_receipts').get().count, 1);

  const second = f.funding.create({ userId: 2, organizerId: 1, amount: 10_000, key: 'paid-request-2' });
  const secondOffer = f.funding.offer({ userId: 1, id: second.id, feeCents: 2500 });
  f.funding.attachLink({ userId: 1, id: second.id, paymentLinkId: LINK });
  assert.throws(() => f.funding.settle({ userId: 2, id: second.id, payment: { ...payment, customerReference: secondOffer.reference } }), (error) => error.code === 'provider_payment_conflict');
  assert.equal(f.db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=1 AND account_key=?').get(`ticket:funding:${second.id}`).balance, 10_000);
  assert.equal(f.db.prepare('SELECT SUM(balance) total FROM organizer_chip_accounts WHERE organizer_id=1').get().total, 50_000);
});

test('insufficient offers roll back, requested rejection replays, and banned paid member keeps escrow', () => {
  const f = fixture();
  const tooLarge = f.funding.create({ userId: 2, organizerId: 1, amount: 50_001, key: 'too-large' });
  assert.throws(() => f.funding.offer({ userId: 1, id: tooLarge.id, feeCents: 100 }), (error) => error.code === 'insufficient_chips');
  assert.equal(f.funding.list(2).find((row) => row.id === tooLarge.id).state, 'requested');
  assert.equal(f.funding.reject({ userId: 1, id: tooLarge.id }).state, 'rejected');
  assert.equal(f.funding.reject({ userId: 1, id: tooLarge.id }).state, 'rejected');

  const held = f.funding.create({ userId: 2, organizerId: 1, amount: 10_000, key: 'ban-after-offer' });
  const offered = f.funding.offer({ userId: 1, id: held.id, feeCents: 2500 });
  f.funding.attachLink({ userId: 1, id: held.id, paymentLinkId: LINK });
  f.db.prepare('UPDATE users SET banned=1 WHERE id=2').run();
  assert.throws(() => f.funding.settle({ userId: 2, id: held.id, payment: { ...PAYMENT, customerReference: offered.reference, paymentLinkId: LINK } }), (error) => error.code === 'member_inactive');
  assert.equal(f.db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=1 AND account_key=?').get(`ticket:funding:${held.id}`).balance, 10_000);
});

test('validation, settlement authorization, immutable receipts, and existing payment reuse are enforced', () => {
  const f = fixture();
  assert.throws(() => f.funding.create({ userId: 2, organizerId: 1, amount: 0, key: 'zero' }), /amount/);
  assert.throws(() => f.funding.list(99), (error) => error.code === 'user_inactive');
  assert.throws(() => f.funding.credit({ userId: 1, id: 'not-a-uuid' }), /funding request id/);
  const request = f.funding.create({ userId: 2, organizerId: 1, amount: 1000, key: 'existing-payment' });
  const offered = f.funding.offer({ userId: 1, id: request.id, feeCents: 2500 });
  assert.throws(() => f.funding.attachLink({ userId: 2, id: request.id, paymentLinkId: LINK }), (error) => error.code === 'organizer_required');
  f.funding.attachLink({ userId: 1, id: request.id, paymentLinkId: LINK });
  assert.equal(f.funding.attachLink({ userId: 1, id: request.id, paymentLinkId: LINK }).paymentLinkId, LINK);
  const payment = { ...PAYMENT, customerReference: offered.reference, paymentLinkId: LINK };
  assert.throws(() => f.funding.settle({ userId: 3, id: request.id, payment }), (error) => error.code === 'member_required');
  f.db.exec('CREATE TABLE club_entry_payments(provider_order_id TEXT,network TEXT,transaction_id TEXT)');
  f.db.prepare('INSERT INTO club_entry_payments VALUES(?,?,?)').run(PAYMENT.id, PAYMENT.network, 'different-tx');
  assert.throws(() => f.funding.settle({ userId: 2, id: request.id, payment }), (error) => error.code === 'provider_payment_conflict');
  f.db.prepare('DELETE FROM club_entry_payments').run();
  f.funding.settle({ userId: 2, id: request.id, payment });
  assert.throws(() => f.db.prepare("UPDATE organizer_funding_receipts SET token='USDT'").run(), /immutable funding receipt/);
  assert.throws(() => f.funding.settle({ userId: 2, id: request.id, payment: { ...payment, transactionId: '0xdifferent' } }), (error) => error.code === 'receipt_conflict');
});

test('credit and offer recheck active approved membership before moving chips', () => {
  const f = fixture();
  const removed = f.funding.create({ userId: 2, organizerId: 1, amount: 1000, key: 'removed' });
  f.db.prepare("UPDATE organizer_club_members SET status='removed' WHERE organizer_id=1 AND user_id=2").run();
  assert.throws(() => f.funding.credit({ userId: 1, id: removed.id }), (error) => error.code === 'member_required');
  assert.equal(f.chips.balance(1, 1), 50_000);
  f.db.prepare("UPDATE organizer_club_members SET status='approved' WHERE organizer_id=1 AND user_id=2").run();
  f.db.prepare('UPDATE users SET banned=1 WHERE id=2').run();
  assert.throws(() => f.funding.offer({ userId: 1, id: removed.id, feeCents: 100 }), (error) => error.code === 'member_inactive');
  assert.equal(f.chips.balance(1, 1), 50_000);
});

test('organizer may verify a trusted provider payment for the requester', () => {
  const f = fixture(), request = f.funding.create({ userId: 2, organizerId: 1, amount: 1000, key: 'owner-settle' });
  const offered = f.funding.offer({ userId: 1, id: request.id, feeCents: 2500 });
  f.funding.attachLink({ userId: 1, id: request.id, paymentLinkId: LINK });
  const paid = f.funding.settle({ userId: 1, id: request.id, payment: { ...PAYMENT, customerReference: offered.reference, paymentLinkId: LINK } });
  assert.equal(paid.state, 'paid');
  assert.equal(f.chips.balance(1, 2), 1000);
});

test('cancel unpaid escrow once; linked offers require provider confirmation', () => {
 const f=fixture(), r=f.funding.create({userId:2,organizerId:1,amount:10000,key:'cancel-offer'});
 f.funding.offer({userId:1,id:r.id,feeCents:100});
 f.funding.cancel({userId:1,id:r.id});
 f.funding.cancel({userId:1,id:r.id});
 assert.equal(f.chips.balance(1,1),50000);
 assert.equal(f.db.prepare("SELECT count(*) n FROM organizer_chip_journals WHERE kind='funding_cancel'").get().n,1);
});

test('linked cancellation requires trusted provider clearance and cannot settle afterward',()=>{
 const f=fixture(),r=f.funding.create({userId:2,organizerId:1,amount:10000,key:'linked-cancel'});
 f.funding.offer({userId:1,id:r.id,feeCents:100});f.funding.attachLink({userId:1,id:r.id,paymentLinkId:LINK});
 assert.throws(()=>f.funding.cancel({userId:2,id:r.id,providerCleared:true}));
 assert.throws(()=>f.funding.cancel({userId:1,id:r.id}),e=>e.code==='provider_confirmation_required');
 assert.equal(f.chips.balance(1,1),40000);
 f.funding.cancel({userId:1,id:r.id,providerCleared:true});f.funding.cancel({userId:1,id:r.id});
 assert.equal(f.chips.balance(1,1),50000);
 assert.throws(()=>f.funding.settle({userId:2,id:r.id,payment:PAYMENT}),e=>e.code==='funding_state');
});
