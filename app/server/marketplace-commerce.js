// SPDX-License-Identifier: AGPL-3.0-only
// Trusted-server commerce primitives. This module does not move money, call a
// payment provider, or expose HTTP routes. Callers must authenticate and authorize
// every mutation and independently verify payment/refund/top-up evidence.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const MARKETPLACE_COMMISSION_BPS = 2000;
const MAX_CENTS = 9_000_000_000;

function fail(message, status = 400, code = 'marketplace_invalid') {
  const error = new Error(message);
  Object.assign(error, { status, code });
  throw error;
}

function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) fail(`Invalid ${label}.`);
  return value.trim();
}

function userId(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('Invalid user ID.');
  return value;
}

function cents(value, signed = false) {
  if (!Number.isSafeInteger(value) || value === 0 || Math.abs(value) > MAX_CENTS || (!signed && value < 0)) fail('Amount must be a bounded integer number of USD cents.');
  return value;
}

function iso(value, label = 'date') {
  const time = typeof value === 'number' ? value : (typeof value === 'string' ? Date.parse(value) : NaN);
  if (!Number.isFinite(time)) fail(`Invalid ${label}.`);
  try { return new Date(time).toISOString(); } catch { fail(`Invalid ${label}.`); }
}

function units(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,77}$/.test(value)) fail('Payment amount must be positive integer base units encoded as a string.');
  return value;
}

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** Round each order's commission up to the next USD cent; never use float money. */
export function marketplaceCommissionCents(amountCents) {
  cents(amountCents);
  return Number((BigInt(amountCents) * BigInt(MARKETPLACE_COMMISSION_BPS) + 9999n) / 10000n);
}

/**
 * Verify a timestamp.rawBody HMAC SHA-256 envelope before parsing JSON.
 * The adapter supplies the provider's extracted timestamp/signature fields.
 * This proves the envelope only: callers still bind merchant, order, network,
 * token and exact amount to the previously persisted server-side order.
 */
export function verifyMarketplaceWebhook({ rawBody, timestamp, signature, secret, now = Date.now(), toleranceSeconds = 300 }) {
  if (!(typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) || Buffer.byteLength(rawBody) > 1_048_576) return false;
  if (typeof secret !== 'string' || !secret || typeof signature !== 'string' || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const stamp = typeof timestamp === 'number' ? String(timestamp) : timestamp;
  if (typeof stamp !== 'string' || !/^[0-9]{1,13}$/.test(stamp)) return false;
  if (!Number.isFinite(now) || !Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 0 || toleranceSeconds > 600) return false;
  const seconds = Number(stamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now / 1000 - seconds) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(stamp).update('.').update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

function nextPeriod(start, pricing) {
  if (pricing === 'one_time') return null;
  const date = new Date(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  if (pricing === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  else if (pricing === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1);
  else fail('Unsupported purchased term.');
  const endDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, endDay));
  return date.toISOString();
}

export function ensureMarketplaceCommerceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_publishers (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('individual','company')),
      nervixpay_merchant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended','rejected')),
      review_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketplace_commerce_offers (
      product_id TEXT PRIMARY KEY REFERENCES marketplace_products(id),
      publisher_id TEXT NOT NULL REFERENCES marketplace_publishers(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketplace_orders (
      id TEXT PRIMARY KEY,
      buyer_user_id INTEGER NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES marketplace_products(id),
      publisher_id TEXT NOT NULL REFERENCES marketplace_publishers(id),
      idempotency_key TEXT NOT NULL,
      seller_merchant_id TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents > 0),
      currency TEXT NOT NULL CHECK(currency = 'USD'),
      pricing TEXT NOT NULL CHECK(pricing IN ('one_time','monthly','yearly')),
      commission_bps INTEGER NOT NULL CHECK(commission_bps = 2000),
      commission_cents INTEGER NOT NULL CHECK(commission_cents > 0),
      status TEXT NOT NULL CHECK(status IN ('awaiting_payment','paid','expired','cancelled','payment_review','refunded')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(buyer_user_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS marketplace_orders_publisher_status ON marketplace_orders(publisher_id,status,expires_at);
    CREATE TABLE IF NOT EXISTS marketplace_payment_bindings (
      order_id TEXT PRIMARY KEY REFERENCES marketplace_orders(id),
      provider TEXT NOT NULL CHECK(provider = 'nervixpay'),
      provider_order_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      network TEXT NOT NULL,
      token TEXT NOT NULL,
      amount_base_units TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(provider,provider_order_id)
    );
    CREATE TABLE IF NOT EXISTS marketplace_payments (
      order_id TEXT PRIMARY KEY REFERENCES marketplace_orders(id),
      provider TEXT NOT NULL CHECK(provider = 'nervixpay'),
      provider_order_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      network TEXT NOT NULL,
      token TEXT NOT NULL,
      amount_base_units TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      UNIQUE(provider,payment_id),
      UNIQUE(provider,provider_order_id)
    );
    CREATE TABLE IF NOT EXISTS marketplace_commission_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publisher_id TEXT NOT NULL REFERENCES marketplace_publishers(id),
      order_id TEXT REFERENCES marketplace_orders(id),
      kind TEXT NOT NULL CHECK(kind IN ('confirmed_topup','adjustment','reserve','release','commission','commission_refund')),
      posted_delta_cents INTEGER NOT NULL,
      reserved_delta_cents INTEGER NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS marketplace_commission_publisher ON marketplace_commission_ledger(publisher_id,id);
    CREATE TRIGGER IF NOT EXISTS marketplace_commission_no_update BEFORE UPDATE ON marketplace_commission_ledger
      BEGIN SELECT RAISE(ABORT,'Commission ledger entries are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS marketplace_commission_no_delete BEFORE DELETE ON marketplace_commission_ledger
      BEGIN SELECT RAISE(ABORT,'Commission ledger entries are immutable'); END;
    CREATE TABLE IF NOT EXISTS marketplace_paid_access (
      order_id TEXT PRIMARY KEY REFERENCES marketplace_orders(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES marketplace_products(id),
      status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      starts_at TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS marketplace_paid_access_user ON marketplace_paid_access(user_id,product_id,status);
    CREATE TABLE IF NOT EXISTS marketplace_commerce_refunds (
      order_id TEXT PRIMARY KEY REFERENCES marketplace_orders(id),
      reference TEXT NOT NULL UNIQUE,
      commission_refund_cents INTEGER NOT NULL CHECK(commission_refund_cents >= 0),
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketplace_commerce_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Internal service only. In particular, creditPublisher, bindPayment, settleOrder
 * and refundOrder accept already verified evidence from a trusted adapter or an
 * authenticated operator. Never wire them directly to a buyer's request body.
 */
export function createMarketplaceCommerce({ db, now = Date.now }) {
  ensureMarketplaceCommerceSchema(db);
  const at = () => iso(now());
  const audit = (actor, action, detail) => db.prepare('INSERT INTO marketplace_commerce_events(actor,action,detail,created_at) VALUES (?,?,?,?)')
    .run(text(actor, 'actor'), action, JSON.stringify(detail), at());
  const activeUser = (id) => {
    const user = db.prepare('SELECT id,banned,deleted_at FROM users WHERE id = ?').get(userId(id));
    if (!user || user.banned || user.deleted_at) fail('Active account required.', 403, 'account_unavailable');
    return user;
  };
  const getPublisher = (id) => {
    const publisher = db.prepare('SELECT * FROM marketplace_publishers WHERE id = ?').get(text(id, 'publisher ID'));
    if (!publisher) fail('Publisher not found.', 404, 'publisher_not_found');
    return { ...publisher };
  };
  const getOrder = (id) => {
    const order = db.prepare('SELECT * FROM marketplace_orders WHERE id = ?').get(text(id, 'order ID'));
    if (!order) fail('Order not found.', 404, 'order_not_found');
    return { ...order };
  };
  const balance = (publisherId) => {
    getPublisher(publisherId);
    const sum = db.prepare(`SELECT COALESCE(SUM(posted_delta_cents),0) posted, COALESCE(SUM(reserved_delta_cents),0) reserved
      FROM marketplace_commission_ledger WHERE publisher_id = ?`).get(publisherId);
    if (!Number.isSafeInteger(sum.posted) || !Number.isSafeInteger(sum.reserved) || sum.posted < 0 || sum.reserved < 0 || sum.posted < sum.reserved) {
      fail('Commission ledger requires reconciliation.', 409, 'ledger_inconsistent');
    }
    return { publisher_id: publisherId, currency: 'USD', posted_cents: sum.posted, reserved_cents: sum.reserved, available_cents: sum.posted - sum.reserved };
  };
  const entry = ({ publisherId, orderId = null, kind, posted = 0, reserved = 0, reference, actor }) => {
    db.prepare(`INSERT INTO marketplace_commission_ledger
      (publisher_id,order_id,kind,posted_delta_cents,reserved_delta_cents,reference,actor,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(publisherId, orderId, kind, posted, reserved, reference, actor, at());
  };
  const release = (order, status, actor, reason) => {
    entry({ publisherId: order.publisher_id, orderId: order.id, kind: 'release', reserved: -order.commission_cents, reference: `release:${order.id}`, actor });
    db.prepare('UPDATE marketplace_orders SET status = ?,updated_at = ? WHERE id = ?').run(status, at(), order.id);
    audit(actor, `order_${status}`, { order_id: order.id, reason });
  };
  const expirePublisherOrders = (publisherId) => {
    const rows = db.prepare("SELECT * FROM marketplace_orders WHERE publisher_id = ? AND status = 'awaiting_payment' AND expires_at <= ?").all(publisherId, at());
    for (const order of rows) release(order, 'expired', 'marketplace-expiry', 'Reservation expired');
    return rows.length;
  };

  function registerPublisher({ ownerUserId, displayName, kind, nervixpayMerchantId, actor = `user:${ownerUserId}` }) {
    activeUser(ownerUserId);
    const who = text(actor, 'actor');
    const display = text(displayName, 'publisher name', 120);
    const merchant = text(nervixpayMerchantId, 'NervixPay merchant ID', 120);
    if (!['individual', 'company'].includes(kind)) fail('Publisher kind must be individual or company.');
    return transaction(db, () => {
      const previous = db.prepare('SELECT * FROM marketplace_publishers WHERE owner_user_id = ?').get(ownerUserId);
      if (previous) {
        if (previous.display_name !== display || previous.kind !== kind || previous.nervixpay_merchant_id !== merchant) fail('This account already has a publisher profile. Changes require a separate review.', 409);
        return { ...previous };
      }
      const id = randomUUID(); const stamp = at();
      db.prepare(`INSERT INTO marketplace_publishers(id,owner_user_id,display_name,kind,nervixpay_merchant_id,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'pending',?,?)`).run(id, ownerUserId, display, kind, merchant, stamp, stamp);
      audit(who, 'publisher_registered', { publisher_id: id });
      return getPublisher(id);
    });
  }

  function reviewPublisher({ publisherId, status, actor, reason }) {
    const who = text(actor, 'actor'); const why = text(reason, 'review reason', 1000);
    if (!['approved', 'suspended', 'rejected'].includes(status)) fail('Invalid publisher review status.');
    return transaction(db, () => {
      const publisher = getPublisher(publisherId);
      if (status === 'approved') activeUser(publisher.owner_user_id);
      db.prepare('UPDATE marketplace_publishers SET status = ?,review_reason = ?,updated_at = ? WHERE id = ?').run(status, why, at(), publisherId);
      audit(who, 'publisher_reviewed', { publisher_id: publisherId, status, reason: why });
      return getPublisher(publisherId);
    });
  }

  function bindOffer({ productId, publisherId, actor }) {
    const who = text(actor, 'actor'); const product = text(productId, 'product ID');
    return transaction(db, () => {
      if (!db.prepare('SELECT id FROM marketplace_products WHERE id = ?').get(product)) fail('Product not found.', 404);
      const publisher = getPublisher(publisherId);
      if (publisher.status !== 'approved') fail('Publisher must be approved before listing an offer.', 409);
      activeUser(publisher.owner_user_id);
      const previous = db.prepare('SELECT * FROM marketplace_commerce_offers WHERE product_id = ?').get(product);
      if (previous && previous.publisher_id !== publisherId) fail('A listed product cannot be reassigned to a different publisher.', 409);
      const stamp = at();
      db.prepare('INSERT OR IGNORE INTO marketplace_commerce_offers(product_id,publisher_id,created_at,updated_at) VALUES (?,?,?,?)').run(product, publisherId, stamp, stamp);
      audit(who, 'offer_bound', { product_id: product, publisher_id: publisherId });
      return { ...db.prepare('SELECT * FROM marketplace_commerce_offers WHERE product_id = ?').get(product) };
    });
  }

  function creditPublisher({ publisherId, amountCents, reference, actor, kind = 'confirmed_topup' }) {
    const who = text(actor, 'actor'); const ref = `funding:${text(reference, 'funding reference', 160)}`;
    if (!['confirmed_topup', 'adjustment'].includes(kind)) fail('Invalid funding kind.');
    cents(amountCents, kind === 'adjustment');
    return transaction(db, () => {
      getPublisher(publisherId);
      const existing = db.prepare('SELECT * FROM marketplace_commission_ledger WHERE reference = ?').get(ref);
      if (existing) {
        if (existing.publisher_id !== publisherId || existing.posted_delta_cents !== amountCents || existing.kind !== kind) fail('Funding reference already recorded with different details.', 409, 'reference_conflict');
        return { ...balance(publisherId), replayed: true };
      }
      const current = balance(publisherId);
      if (current.available_cents + amountCents < 0 || current.posted_cents + amountCents > MAX_CENTS) fail('Adjustment would consume reserved credits or exceed the balance limit.', 409);
      entry({ publisherId, kind, posted: amountCents, reference: ref, actor: who });
      audit(who, 'publisher_funded', { publisher_id: publisherId, kind, amount_cents: amountCents, reference });
      return { ...balance(publisherId), replayed: false };
    });
  }

  function reserveOrder({ buyerUserId, productId, idempotencyKey, holdSeconds = 900 }) {
    activeUser(buyerUserId);
    const product = text(productId, 'product ID'); const key = text(idempotencyKey, 'idempotency key', 120);
    if (!Number.isSafeInteger(holdSeconds) || holdSeconds < 60 || holdSeconds > 86_400) fail('Reservation duration must be between 60 and 86400 seconds.');
    return transaction(db, () => {
      const previous = db.prepare('SELECT * FROM marketplace_orders WHERE buyer_user_id = ? AND idempotency_key = ?').get(buyerUserId, key);
      if (previous) {
        if (previous.product_id !== product) fail('Idempotency key belongs to another product.', 409, 'reference_conflict');
        return { ...previous, replayed: true };
      }
      const offer = db.prepare(`SELECT p.*,o.publisher_id FROM marketplace_products p
        JOIN marketplace_commerce_offers o ON o.product_id = p.id WHERE p.id = ?`).get(product);
      if (!offer) fail('No approved commercial offer for this product.', 409, 'offer_unavailable');
      if (offer.status !== 'available' || offer.currency !== 'USD' || !['one_time', 'monthly', 'yearly'].includes(offer.pricing)) fail('This offer is not ready for a fixed-price USD purchase.', 409, 'offer_unavailable');
      cents(offer.price_cents);
      const publisher = getPublisher(offer.publisher_id);
      if (publisher.status !== 'approved') fail('This publisher is not accepting new purchases.', 409, 'publisher_unavailable');
      activeUser(publisher.owner_user_id);
      expirePublisherOrders(publisher.id);
      const fee = marketplaceCommissionCents(offer.price_cents);
      if (balance(publisher.id).available_cents < fee) fail('Publisher needs more commission credits before accepting this purchase.', 409, 'publisher_credit_required');
      const id = randomUUID(); const stamp = at();
      db.prepare(`INSERT INTO marketplace_orders(id,buyer_user_id,product_id,publisher_id,idempotency_key,seller_merchant_id,
        price_cents,currency,pricing,commission_bps,commission_cents,status,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'USD',?,?,?,'awaiting_payment',?,?,?)`)
        .run(id, buyerUserId, product, publisher.id, key, publisher.nervixpay_merchant_id, offer.price_cents, offer.pricing,
          MARKETPLACE_COMMISSION_BPS, fee, iso(now() + holdSeconds * 1000), stamp, stamp);
      entry({ publisherId: publisher.id, orderId: id, kind: 'reserve', reserved: fee, reference: `reserve:${id}`, actor: `user:${buyerUserId}` });
      audit(`user:${buyerUserId}`, 'order_reserved', { order_id: id, product_id: product, price_cents: offer.price_cents, commission_cents: fee });
      return { ...getOrder(id), replayed: false };
    });
  }

  function bindPayment({ orderId, providerOrderId, merchantId, network, token, amountBaseUnits, actor = 'payment-adapter' }) {
    const who = text(actor, 'actor');
    const values = { provider_order_id: text(providerOrderId, 'provider order ID'), merchant_id: text(merchantId, 'merchant ID', 120),
      network: text(network, 'network', 80), token: text(token, 'token', 160), amount_base_units: units(amountBaseUnits) };
    return transaction(db, () => {
      const order = getOrder(orderId);
      if (values.merchant_id !== order.seller_merchant_id) fail('Payment merchant differs from the reserved seller.', 409, 'payment_mismatch');
      const previous = db.prepare('SELECT * FROM marketplace_payment_bindings WHERE order_id = ?').get(orderId);
      if (previous) {
        if (Object.entries(values).some(([key, value]) => previous[key] !== value)) fail('Payment binding cannot be changed.', 409, 'payment_mismatch');
        return { ...previous };
      }
      if (order.status !== 'awaiting_payment' || order.expires_at <= at()) fail('Order reservation is no longer payable.', 409, 'order_not_payable');
      const duplicate = db.prepare("SELECT order_id FROM marketplace_payment_bindings WHERE provider = 'nervixpay' AND provider_order_id = ?").get(values.provider_order_id);
      if (duplicate) fail('Provider order is already bound to a different purchase.', 409, 'reference_conflict');
      db.prepare(`INSERT INTO marketplace_payment_bindings(order_id,provider,provider_order_id,merchant_id,network,token,amount_base_units,created_at)
        VALUES (?,'nervixpay',?,?,?,?,?,?)`).run(orderId, values.provider_order_id, values.merchant_id, values.network, values.token, values.amount_base_units, at());
      audit(who, 'payment_bound', { order_id: orderId, provider_order_id: values.provider_order_id });
      return { ...db.prepare('SELECT * FROM marketplace_payment_bindings WHERE order_id = ?').get(orderId) };
    });
  }

  function settleOrder({ providerOrderId, paymentId, merchantId, network, token, amountBaseUnits, paidAt, actor = 'payment-adapter' }) {
    const who = text(actor, 'actor');
    const paid = iso(paidAt, 'payment date');
    if (Date.parse(paid) > now() + 300_000) fail('Payment date is in the future.', 409, 'payment_mismatch');
    const evidence = { provider_order_id: text(providerOrderId, 'provider order ID'), payment_id: text(paymentId, 'payment ID'),
      merchant_id: text(merchantId, 'merchant ID', 120), network: text(network, 'network', 80), token: text(token, 'token', 160),
      amount_base_units: units(amountBaseUnits), paid_at: paid };
    return transaction(db, () => {
      const binding = db.prepare("SELECT * FROM marketplace_payment_bindings WHERE provider = 'nervixpay' AND provider_order_id = ?").get(evidence.provider_order_id);
      if (!binding) fail('Payment does not match a server-bound order.', 409, 'payment_unbound');
      for (const key of ['merchant_id', 'network', 'token', 'amount_base_units']) {
        if (binding[key] !== evidence[key]) fail(`Payment ${key} differs from the stored quote.`, 409, 'payment_mismatch');
      }
      const order = getOrder(binding.order_id);
      if (Date.parse(paid) + 300_000 < Date.parse(order.created_at)) fail('Payment predates the purchase.', 409, 'payment_mismatch');
      const previous = db.prepare("SELECT * FROM marketplace_payments WHERE provider = 'nervixpay' AND (payment_id = ? OR provider_order_id = ?)").all(evidence.payment_id, evidence.provider_order_id);
      if (previous.length) {
        if (previous.length !== 1 || previous[0].order_id !== order.id || Object.entries(evidence).some(([key, value]) => previous[0][key] !== value)) fail('Payment reference was already used with different details.', 409, 'reference_conflict');
        return { order: getOrder(order.id), access: db.prepare('SELECT * FROM marketplace_paid_access WHERE order_id = ?').get(order.id) || null, replayed: true };
      }
      if (!['awaiting_payment', 'expired', 'cancelled'].includes(order.status)) fail('Order cannot accept another payment.', 409);
      const stamp = at();
      db.prepare(`INSERT INTO marketplace_payments(order_id,provider,provider_order_id,payment_id,merchant_id,network,token,amount_base_units,paid_at,recorded_at)
        VALUES (?,'nervixpay',?,?,?,?,?,?,?,?)`).run(order.id, evidence.provider_order_id, evidence.payment_id, evidence.merchant_id,
          evidence.network, evidence.token, evidence.amount_base_units, paid, stamp);
      // Funds arriving after a released/expired quote require reconciliation.
      // Preserve the receipt, do not charge a now-unfunded seller or grant access.
      if (order.status !== 'awaiting_payment' || paid > order.expires_at) {
        if (order.status === 'awaiting_payment') release(order, 'expired', who, 'Payment arrived after quote expiry');
        db.prepare("UPDATE marketplace_orders SET status = 'payment_review',updated_at = ? WHERE id = ?").run(stamp, order.id);
        audit(who, 'payment_requires_review', { order_id: order.id, payment_id: evidence.payment_id });
        return { order: getOrder(order.id), access: null, replayed: false };
      }
      entry({ publisherId: order.publisher_id, orderId: order.id, kind: 'commission', posted: -order.commission_cents,
        reserved: -order.commission_cents, reference: `commission:${order.id}`, actor: who });
      balance(order.publisher_id);
      // Each paid order owns its own interval, so refunding one purchase cannot
      // revoke a separate paid purchase for the same product.
      const previousAccess = db.prepare(`SELECT a.expires_at FROM marketplace_paid_access a JOIN marketplace_orders o ON o.id = a.order_id
        WHERE a.user_id = ? AND a.product_id = ? AND a.status = 'active' AND o.status = 'paid' AND a.expires_at > ? ORDER BY a.expires_at DESC LIMIT 1`)
        .get(order.buyer_user_id, order.product_id, paid);
      const start = order.pricing === 'one_time' ? paid : (previousAccess?.expires_at || paid);
      const expiry = nextPeriod(start, order.pricing);
      db.prepare(`INSERT INTO marketplace_paid_access(order_id,user_id,product_id,status,starts_at,expires_at,created_at,updated_at)
        VALUES (?,?,?,'active',?,?,?,?)`).run(order.id, order.buyer_user_id, order.product_id, start, expiry, stamp, stamp);
      db.prepare("UPDATE marketplace_orders SET status = 'paid',updated_at = ? WHERE id = ?").run(stamp, order.id);
      audit(who, 'order_paid', { order_id: order.id, payment_id: evidence.payment_id, commission_cents: order.commission_cents });
      return { order: getOrder(order.id), access: { ...db.prepare('SELECT * FROM marketplace_paid_access WHERE order_id = ?').get(order.id) }, replayed: false };
    });
  }

  function releaseOrder({ orderId, reason, actor }) {
    const who = text(actor, 'actor'); const why = text(reason, 'release reason', 1000);
    return transaction(db, () => {
      const order = getOrder(orderId);
      if (['expired', 'cancelled'].includes(order.status)) return { ...order, replayed: true };
      if (order.status !== 'awaiting_payment') fail('Only an unpaid reservation can be released.', 409);
      release(order, order.expires_at <= at() ? 'expired' : 'cancelled', who, why);
      return { ...getOrder(orderId), replayed: false };
    });
  }

  function refundOrder({ orderId, refundReference, actor }) {
    const who = text(actor, 'actor'); const reference = text(refundReference, 'verified refund reference', 160);
    return transaction(db, () => {
      const order = getOrder(orderId);
      const previous = db.prepare('SELECT * FROM marketplace_commerce_refunds WHERE order_id = ? OR reference = ?').all(orderId, reference);
      if (previous.length) {
        if (previous.length !== 1 || previous[0].order_id !== orderId || previous[0].reference !== reference) fail('Refund reference conflicts with an existing refund.', 409, 'reference_conflict');
        return { order, refund: { ...previous[0] }, replayed: true };
      }
      if (!['paid', 'payment_review'].includes(order.status)) fail('Only a recorded payment can be refunded.', 409);
      const fee = order.status === 'paid' ? order.commission_cents : 0;
      if (fee) {
        if (balance(order.publisher_id).posted_cents + fee > MAX_CENTS) fail('Refund needs balance reconciliation before posting.', 409);
        entry({ publisherId: order.publisher_id, orderId, kind: 'commission_refund', posted: fee, reference: `refund:${orderId}`, actor: who });
      }
      const stamp = at();
      db.prepare('INSERT INTO marketplace_commerce_refunds(order_id,reference,commission_refund_cents,actor,created_at) VALUES (?,?,?,?,?)').run(orderId, reference, fee, who, stamp);
      db.prepare("UPDATE marketplace_paid_access SET status = 'revoked',updated_at = ? WHERE order_id = ?").run(stamp, orderId);
      db.prepare("UPDATE marketplace_orders SET status = 'refunded',updated_at = ? WHERE id = ?").run(stamp, orderId);
      audit(who, 'order_refunded', { order_id: orderId, refund_reference: reference, commission_refund_cents: fee });
      return { order: getOrder(orderId), refund: { ...db.prepare('SELECT * FROM marketplace_commerce_refunds WHERE order_id = ?').get(orderId) }, replayed: false };
    });
  }

  function hasPaidAccess(id, productId, time = now()) {
    userId(id); const product = text(productId, 'product ID'); const stamp = iso(time);
    return !!db.prepare(`SELECT 1 FROM marketplace_paid_access a JOIN marketplace_orders o ON o.id = a.order_id
      JOIN users u ON u.id = a.user_id WHERE a.user_id = ? AND a.product_id = ? AND a.status = 'active' AND o.status = 'paid'
      AND a.starts_at <= ? AND (a.expires_at IS NULL OR a.expires_at > ?) AND COALESCE(u.banned,0) = 0 AND u.deleted_at IS NULL LIMIT 1`)
      .get(id, product, stamp, stamp);
  }

  function listPaidAccess(id) {
    userId(id);
    return db.prepare(`SELECT a.*,p.name product_name FROM marketplace_paid_access a
      JOIN marketplace_products p ON p.id = a.product_id WHERE a.user_id = ? ORDER BY a.created_at DESC,a.order_id LIMIT 500`).all(id).map((row) => ({ ...row }));
  }

  return {
    registerPublisher, reviewPublisher, bindOffer, creditPublisher, balance, reserveOrder, bindPayment,
    settleOrder, releaseOrder, refundOrder, hasPaidAccess, listPaidAccess, getPublisher, getOrder,
    getPaymentBinding: (orderId) => { getOrder(orderId); const row = db.prepare('SELECT * FROM marketplace_payment_bindings WHERE order_id = ?').get(orderId); return row ? { ...row } : null; },
    getPayment: (orderId) => { getOrder(orderId); const row = db.prepare('SELECT * FROM marketplace_payments WHERE order_id = ?').get(orderId); return row ? { ...row } : null; },
    listOffers: () => db.prepare('SELECT * FROM marketplace_commerce_offers ORDER BY created_at DESC LIMIT 500').all().map((row) => ({ ...row })),
    expireReservations: (publisherId) => transaction(db, () => { getPublisher(publisherId); return expirePublisherOrders(publisherId); }),
    publisherForUser: (id) => { userId(id); const row = db.prepare('SELECT * FROM marketplace_publishers WHERE owner_user_id = ?').get(id); return row ? { ...row } : null; },
    listPublishers: () => db.prepare('SELECT * FROM marketplace_publishers ORDER BY created_at DESC LIMIT 500').all().map((row) => ({ ...row })),
    listOrders: ({ buyerUserId, publisherId } = {}) => {
      if (buyerUserId !== undefined) return db.prepare('SELECT * FROM marketplace_orders WHERE buyer_user_id = ? ORDER BY created_at DESC,id LIMIT 500').all(userId(buyerUserId)).map((row) => ({ ...row }));
      if (publisherId !== undefined) return db.prepare('SELECT * FROM marketplace_orders WHERE publisher_id = ? ORDER BY created_at DESC,id LIMIT 500').all(text(publisherId, 'publisher ID')).map((row) => ({ ...row }));
      return db.prepare('SELECT * FROM marketplace_orders ORDER BY created_at DESC,id LIMIT 500').all().map((row) => ({ ...row }));
    },
    listLedger: (publisherId) => { getPublisher(publisherId); return db.prepare('SELECT * FROM marketplace_commission_ledger WHERE publisher_id = ? ORDER BY id DESC LIMIT 500').all(publisherId).map((row) => ({ ...row })); },
  };
}
