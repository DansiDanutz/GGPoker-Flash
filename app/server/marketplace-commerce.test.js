// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ensureMarketplaceSchema } from './marketplace.js';
import { createMarketplaceCommerce, marketplaceCommissionCents, verifyMarketplaceWebhook } from './marketplace-commerce.js';

function fixture(t, { pricing = 'monthly', price = 10_000, credits = 20_000, date = '2026-11-16T12:00:00.000Z' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,login TEXT,nick TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT,
      is_admin INTEGER DEFAULT 0,balance INTEGER DEFAULT 125000,play_chips INTEGER DEFAULT 200000);
    INSERT INTO users(id,login,nick) VALUES (1,'seller','Seller'),(2,'buyer','Buyer'),(3,'buyer_two','Buyer Two'),(4,'seller_two','Seller Two');`);
  ensureMarketplaceSchema(db);
  let time = Date.parse(date);
  const service = createMarketplaceCommerce({ db, now: () => time });
  t.after(() => db.close());
  const publisher = service.registerPublisher({ ownerUserId: 1, displayName: 'First Party Studio', kind: 'company', nervixpayMerchantId: 'merchant-1' });
  service.reviewPublisher({ publisherId: publisher.id, status: 'approved', actor: 'operator:1', reason: 'Merchant ownership and commercial terms verified.' });
  db.prepare(`INSERT INTO marketplace_products(id,slug,name,summary,description,category,delivery,status,pricing,price_cents,currency,features_json,created_at,updated_at)
    VALUES ('test-manager','test-manager','Test manager','Private organizer controls','Hosted controls','tools','hosted_service','available',?,?,'USD','[]',?,?)`)
    .run(pricing, price, date, date);
  service.bindOffer({ productId: 'test-manager', publisherId: publisher.id, actor: 'operator:1' });
  if (credits) service.creditPublisher({ publisherId: publisher.id, amountCents: credits, reference: 'verified-topup-1', actor: 'operator:1' });
  let sequence = 0;
  const reserve = (options = {}) => service.reserveOrder({ buyerUserId: 2, productId: 'test-manager', idempotencyKey: `purchase-${++sequence}`, ...options });
  const proof = (order, overrides = {}) => ({ providerOrderId: `nervix-${order.id}`, paymentId: `chain-payment-${order.id}`, merchantId: 'merchant-1',
    network: 'polygon', token: 'USDC', amountBaseUnits: '100000000', paidAt: new Date(time).toISOString(), ...overrides });
  const bind = (order, overrides = {}) => {
    const evidence = proof(order, overrides);
    service.bindPayment({ orderId: order.id, ...evidence });
    return evidence;
  };
  const purchase = (options = {}) => { const order = reserve(options); const evidence = bind(order); return { ...service.settleOrder(evidence), evidence }; };
  return { db, service, publisher, reserve, proof, bind, purchase, setTime: (next) => { time = typeof next === 'number' ? next : Date.parse(next); } };
}

test('commission uses integer cents and explicitly rounds fractional cents upward', () => {
  assert.equal(marketplaceCommissionCents(10_000), 2_000);
  assert.equal(marketplaceCommissionCents(1), 1);
  assert.equal(marketplaceCommissionCents(101), 21);
  assert.equal(marketplaceCommissionCents(9_000_000_000), 1_800_000_000);
  for (const invalid of [0, -1, 1.1, NaN, Infinity, '100', 9_000_000_001]) assert.throws(() => marketplaceCommissionCents(invalid));
});

test('a publisher requires an active user and explicit approval; profiles cannot silently change payment identity', (t) => {
  const { service, db } = fixture(t);
  const publisher = service.registerPublisher({ ownerUserId: 4, displayName: 'Independent Developer', kind: 'individual', nervixpayMerchantId: 'merchant-4' });
  assert.equal(publisher.status, 'pending');
  assert.throws(() => service.bindOffer({ productId: 'club-hosting', publisherId: publisher.id, actor: 'operator:1' }), /approved/);
  assert.throws(() => service.registerPublisher({ ownerUserId: 4, displayName: 'Independent Developer', kind: 'individual', nervixpayMerchantId: 'attacker-wallet' }), /already has/);
  db.prepare('UPDATE users SET banned = 1 WHERE id = 4').run();
  assert.throws(() => service.reviewPublisher({ publisherId: publisher.id, status: 'approved', actor: 'operator:1', reason: 'Test review' }), /Active account/);
  assert.equal(service.getPublisher(publisher.id).status, 'pending');
});

test('confirmed top-ups are idempotent, cannot cross publishers and do not touch play-money balances', (t) => {
  const { service, db, publisher } = fixture(t);
  const before = db.prepare('SELECT * FROM users WHERE id = 1').get();
  const replay = service.creditPublisher({ publisherId: publisher.id, amountCents: 20_000, reference: 'verified-topup-1', actor: 'operator:1' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.posted_cents, 20_000);
  assert.throws(() => service.creditPublisher({ publisherId: publisher.id, amountCents: 30_000, reference: 'verified-topup-1', actor: 'operator:1' }), /different details/);
  const other = service.registerPublisher({ ownerUserId: 4, displayName: 'Other Publisher', kind: 'individual', nervixpayMerchantId: 'merchant-4' });
  assert.throws(() => service.creditPublisher({ publisherId: other.id, amountCents: 20_000, reference: 'verified-topup-1', actor: 'operator:1' }), /different details/);
  assert.throws(() => service.creditPublisher({ publisherId: publisher.id, amountCents: -1, reference: 'negative-topup', actor: 'operator:1' }));
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id = 1').get(), before);
});

test('two checkouts cannot reserve the same last credits; retry does not reserve twice', (t) => {
  const { service, publisher, reserve } = fixture(t, { credits: 2_000 });
  const order = reserve({ idempotencyKey: 'stable-key' });
  assert.equal(order.price_cents, 10_000);
  assert.equal(order.commission_cents, 2_000);
  assert.deepEqual(service.balance(publisher.id), { publisher_id: publisher.id, currency: 'USD', posted_cents: 2_000, reserved_cents: 2_000, available_cents: 0 });
  assert.equal(reserve({ idempotencyKey: 'stable-key' }).id, order.id);
  assert.throws(() => reserve({ buyerUserId: 3 }), (error) => error.code === 'publisher_credit_required');
  assert.equal(service.listOrders().length, 1);
  assert.equal(service.listLedger(publisher.id).filter((row) => row.kind === 'reserve').length, 1);
  assert.throws(() => service.creditPublisher({ publisherId: publisher.id, amountCents: -1, kind: 'adjustment', reference: 'steal-held-credit', actor: 'operator:1' }), /reserved credits/);
});

test('unavailable, quote, free and non-USD offers cannot initiate a paid order', (t) => {
  const { service, db, reserve, publisher } = fixture(t);
  for (const [status, pricing, currency, price] of [
    ['coming_soon', 'monthly', 'USD', 10000], ['draft', 'monthly', 'USD', 10000], ['archived', 'monthly', 'USD', 10000],
    ['available', 'quote', 'USD', null], ['available', 'free', 'USD', 0], ['available', 'monthly', 'EUR', 10000],
  ]) {
    db.prepare('UPDATE marketplace_products SET status=?,pricing=?,currency=?,price_cents=? WHERE id = ?').run(status, pricing, currency, price, 'test-manager');
    assert.throws(() => reserve(), (error) => error.code === 'offer_unavailable');
  }
  assert.equal(service.listOrders().length, 0);
  assert.equal(service.balance(publisher.id).reserved_cents, 0);
});

test('the last funded sale stays active when commission reduces the publisher balance to zero', (t) => {
  const { service, publisher, purchase, reserve, db } = fixture(t, { credits: 2_000 });
  const userBefore = db.prepare('SELECT * FROM users WHERE id = 2').get();
  const result = purchase();
  assert.equal(result.order.status, 'paid');
  assert.equal(service.balance(publisher.id).available_cents, 0);
  assert.equal(service.hasPaidAccess(2, 'test-manager'), true);
  assert.equal(service.hasPaidAccess(3, 'test-manager'), false);
  assert.equal(service.listPaidAccess(2).length, 1);
  assert.throws(() => reserve(), (error) => error.code === 'publisher_credit_required');
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id = 2').get(), userBefore, 'purchase does not grant admin or alter play chips');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM marketplace_entitlements').get().n, 0, 'paid access is separate from manual grants');
});

test('manual access records do not masquerade as a paid entitlement', (t) => {
  const { service, db } = fixture(t);
  db.prepare(`INSERT INTO marketplace_entitlements(product_id,user_id,status,created_at,updated_at)
    VALUES ('test-manager',2,'active','2026-11-16','2026-11-16')`).run();
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
});

test('payment binding is immutable and exact merchant, network, token and base units are enforced', (t) => {
  const { service, reserve, bind, proof, publisher } = fixture(t);
  const order = reserve();
  assert.throws(() => service.bindPayment({ orderId: order.id, ...proof(order), merchantId: 'other-merchant' }), /reserved seller/);
  const evidence = bind(order);
  assert.throws(() => service.bindPayment({ orderId: order.id, ...evidence, amountBaseUnits: '1' }), /cannot be changed/);
  for (const changed of [{ merchantId: 'other-merchant' }, { network: 'ethereum' }, { token: 'USDT' }, { amountBaseUnits: '1' }]) {
    assert.throws(() => service.settleOrder({ ...evidence, ...changed }), (error) => error.code === 'payment_mismatch');
  }
  assert.throws(() => service.settleOrder({ ...evidence, providerOrderId: 'unknown-payment' }), (error) => error.code === 'payment_unbound');
  assert.equal(service.getOrder(order.id).status, 'awaiting_payment');
  assert.equal(service.balance(publisher.id).reserved_cents, 2_000);
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
});

test('verified settlement and its retries debit commission and grant access exactly once', (t) => {
  const { service, reserve, bind, publisher } = fixture(t);
  const order = reserve(); const evidence = bind(order);
  const first = service.settleOrder(evidence);
  const replay = service.settleOrder(evidence);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.access.order_id, replay.access.order_id);
  assert.equal(service.balance(publisher.id).posted_cents, 18_000);
  assert.equal(service.balance(publisher.id).reserved_cents, 0);
  assert.equal(service.listLedger(publisher.id).filter((row) => row.kind === 'commission').length, 1);
  assert.throws(() => service.settleOrder({ ...evidence, paymentId: 'another-payment' }), (error) => error.code === 'reference_conflict');
  assert.throws(() => service.settleOrder({ ...evidence, paidAt: '2026-11-16T12:01:00.000Z' }), (error) => error.code === 'reference_conflict');
});

test('a transaction or provider order cannot be reused for another buyer or purchase', (t) => {
  const { service, purchase, reserve, bind, proof } = fixture(t);
  const first = purchase();
  const second = reserve({ buyerUserId: 3 });
  assert.throws(() => service.bindPayment({ orderId: second.id, ...proof(second), providerOrderId: first.evidence.providerOrderId }), (error) => error.code === 'reference_conflict');
  const evidence = bind(second);
  assert.throws(() => service.settleOrder({ ...evidence, paymentId: first.evidence.paymentId }), (error) => error.code === 'reference_conflict');
  assert.equal(service.getOrder(second.id).status, 'awaiting_payment');
  assert.equal(service.hasPaidAccess(3, 'test-manager'), false);
});

test('reservation freezes price, commission, term and seller despite catalog changes', (t) => {
  const { service, db, reserve, bind, publisher } = fixture(t);
  const order = reserve(); const evidence = bind(order);
  db.prepare("UPDATE marketplace_products SET price_cents = 20000,pricing='yearly',status='archived' WHERE id='test-manager'").run();
  service.reviewPublisher({ publisherId: publisher.id, status: 'suspended', actor: 'operator:1', reason: 'Pause new sales pending publisher review.' });
  const settled = service.settleOrder(evidence);
  assert.equal(settled.order.price_cents, 10_000);
  assert.equal(settled.order.commission_cents, 2_000);
  assert.equal(settled.access.expires_at, '2026-12-16T12:00:00.000Z');
  assert.equal(service.hasPaidAccess(2, 'test-manager'), true, 'sale suspension and catalog archival do not cancel paid service');
});

test('expired reservations release once; late money is recorded for review without spending other credits', (t) => {
  const { service, reserve, bind, publisher, setTime } = fixture(t, { credits: 2_000 });
  const order = reserve({ holdSeconds: 60 }); const evidence = bind(order);
  setTime('2026-11-16T12:02:00.000Z');
  assert.equal(service.expireReservations(publisher.id), 1);
  assert.equal(service.expireReservations(publisher.id), 0);
  assert.equal(service.balance(publisher.id).available_cents, 2_000);
  const other = reserve({ buyerUserId: 3 });
  const late = service.settleOrder({ ...evidence, paidAt: '2026-11-16T12:01:30.000Z' });
  assert.equal(late.order.status, 'payment_review');
  assert.equal(late.access, null);
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
  assert.equal(service.balance(publisher.id).reserved_cents, other.commission_cents);
  assert.equal(service.balance(publisher.id).posted_cents, 2_000);
  const refund = service.refundOrder({ orderId: order.id, refundReference: 'verified-late-refund', actor: 'operator:1' });
  assert.equal(refund.refund.commission_refund_cents, 0);
});

test('a payment before quote expiry can settle after webhook delivery delay while the hold still exists', (t) => {
  const { service, reserve, bind, setTime } = fixture(t);
  const order = reserve({ holdSeconds: 60 }); const evidence = bind(order);
  setTime('2026-11-16T12:05:00.000Z');
  assert.equal(service.settleOrder(evidence).order.status, 'paid');
  assert.equal(service.hasPaidAccess(2, 'test-manager'), true);
});

test('cancelled orders release once and cannot activate if money later arrives', (t) => {
  const { service, reserve, bind, publisher } = fixture(t);
  const order = reserve(); const evidence = bind(order);
  assert.equal(service.releaseOrder({ orderId: order.id, actor: 'operator:1', reason: 'Customer cancelled.' }).status, 'cancelled');
  assert.equal(service.releaseOrder({ orderId: order.id, actor: 'operator:1', reason: 'Retry.' }).replayed, true);
  assert.equal(service.balance(publisher.id).reserved_cents, 0);
  assert.equal(service.settleOrder(evidence).order.status, 'payment_review');
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
});

test('refund reverses only its earned commission and its entitlement, once', (t) => {
  const { service, publisher, purchase } = fixture(t, { pricing: 'one_time' });
  const first = purchase(); const second = purchase();
  const result = service.refundOrder({ orderId: first.order.id, refundReference: 'chain-refund-1', actor: 'operator:1' });
  assert.equal(result.order.status, 'refunded');
  assert.equal(result.refund.commission_refund_cents, 2_000);
  assert.equal(service.balance(publisher.id).posted_cents, 18_000);
  assert.equal(service.hasPaidAccess(2, 'test-manager'), true, 'separate purchased access remains active');
  assert.equal(service.refundOrder({ orderId: first.order.id, refundReference: 'chain-refund-1', actor: 'operator:1' }).replayed, true);
  assert.throws(() => service.refundOrder({ orderId: second.order.id, refundReference: 'chain-refund-1', actor: 'operator:1' }), /conflicts/);
  service.refundOrder({ orderId: second.order.id, refundReference: 'chain-refund-2', actor: 'operator:1' });
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
  assert.equal(service.balance(publisher.id).posted_cents, 20_000);
});

test('monthly terms clamp month ends, renew from purchased expiry and stop at exact expiry', (t) => {
  const { service, purchase, setTime } = fixture(t, { date: '2028-01-31T12:00:00.000Z' });
  const first = purchase();
  assert.equal(first.access.expires_at, '2028-02-29T12:00:00.000Z');
  const second = purchase();
  assert.equal(second.access.starts_at, first.access.expires_at);
  assert.equal(second.access.expires_at, '2028-03-29T12:00:00.000Z');
  setTime('2028-03-29T11:59:59.999Z');
  assert.equal(service.hasPaidAccess(2, 'test-manager'), true);
  setTime(second.access.expires_at);
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
});

test('annual leap-day terms and one-time terms are distinct; account bans still apply', (t) => {
  const { service, purchase, db, setTime } = fixture(t, { pricing: 'yearly', date: '2028-02-29T12:00:00.000Z' });
  assert.equal(purchase().access.expires_at, '2029-02-28T12:00:00.000Z');
  db.prepare("UPDATE marketplace_products SET pricing='one_time' WHERE id='test-manager'").run();
  assert.equal(purchase().access.expires_at, null);
  setTime('2040-01-01T00:00:00.000Z');
  assert.equal(service.hasPaidAccess(2, 'test-manager'), true);
  db.prepare('UPDATE users SET banned = 1 WHERE id = 2').run();
  assert.equal(service.hasPaidAccess(2, 'test-manager'), false);
});

test('ledger is append-only and rollback leaves no financial half-state', (t) => {
  const { service, publisher, db, reserve, bind } = fixture(t);
  assert.throws(() => db.exec('UPDATE marketplace_commission_ledger SET posted_delta_cents = 0'), /immutable/);
  assert.throws(() => db.exec('DELETE FROM marketplace_commission_ledger'), /immutable/);
  const order = reserve(); const evidence = bind(order);
  db.exec("CREATE TRIGGER refuse_access BEFORE INSERT ON marketplace_paid_access BEGIN SELECT RAISE(ABORT,'test write failure'); END;");
  assert.throws(() => service.settleOrder(evidence), /test write failure/);
  assert.equal(service.getOrder(order.id).status, 'awaiting_payment');
  assert.equal(service.balance(publisher.id).posted_cents, 20_000);
  assert.equal(service.balance(publisher.id).reserved_cents, 2_000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM marketplace_payments').get().n, 0);
  assert.equal(service.listLedger(publisher.id).filter((row) => row.kind === 'commission').length, 0);
  db.exec('DROP TRIGGER refuse_access');
  assert.equal(service.settleOrder(evidence).order.status, 'paid');
});

test('webhooks verify the exact raw body and recent signed timestamp, never a browser event', () => {
  const timestamp = '1794830400'; const now = Number(timestamp) * 1000;
  const secret = 'test-only-webhook-secret'; const rawBody = '{"type":"payment.paid","amount":"100000000"}';
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const envelope = { rawBody, timestamp, signature, secret, now };
  assert.equal(verifyMarketplaceWebhook(envelope), true);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, rawBody: Buffer.from(rawBody) }), true);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, rawBody: rawBody + ' ' }), false);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, now: now + 301_000 }), false);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, now: now - 301_000 }), false);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, signature: '0'.repeat(64) }), false);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, signature: 'x'.repeat(64) }), false);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, secret: '' }), false);
  assert.equal(verifyMarketplaceWebhook({ ...envelope, timestamp: '1794830400.0' }), false);
});
