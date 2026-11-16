// SPDX-License-Identifier: AGPL-3.0-only
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';
import { managementMode, privateSpinConfig } from './management-plugins.js';

let srv, admin, alice, bob, aliceId, adminId, publisher, cashOrder, cashTable;
const CASH = 'cash-games-manager';
const TOURNEY = 'tournaments-manager';
const SPIN = 'spin-and-go-manager';
const ROOT = '/api/admin/marketplace/commerce';

async function call(method, route, token, body, headers = {}) {
  const response = await fetch(srv.base + route, { method, headers: {
    ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const finance = (route, body) => call(body === undefined ? 'GET' : 'POST', ROOT + route, admin, body);
async function success(route, body) {
  const result = await finance(route, body);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
async function buy(productId, buyerUserId = aliceId) {
  const { order } = await success('/orders', { buyerUserId, productId, idempotencyKey: crypto.randomUUID() });
  const evidence = { providerOrderId: `provider-${order.id}`, merchantId: 'merchant-fixture', network: 'polygon', token: 'USDC', amountBaseUnits: '100000000' };
  await success(`/orders/${order.id}/payment-binding`, evidence);
  const result = await success('/payments/confirm', { ...evidence, paymentId: `tx-${order.id}`, paidAt: new Date().toISOString() });
  return result.order;
}

before(async () => {
  srv = await startServer({ env: { GGPOKER_MARKETPLACE_ENFORCEMENT: 'enforce' } });
  admin = await srv.login('admin', 'admin123');
  adminId = (await srv.get('/api/me', { token: admin })).data.user.id;
  const register = (login) => srv.post('/api/auth/register', { body: { login, nick: login, password: 'test-management-password' } });
  const a = (await register('plugin_alice')).data;
  const b = (await register('plugin_bob')).data;
  alice = a.token; aliceId = a.user.id; bob = b.token;
});
after(async () => { if (srv) await srv.stop(); });

test('mode is explicit and invalid configuration fails instead of silently disabling enforcement', () => {
  assert.equal(managementMode(''), 'off');
  assert.equal(managementMode('observe'), 'observe');
  assert.throws(() => managementMode('enabled'), /must be/);
  assert.throws(() => privateSpinConfig({ stake: 1234 }), /supported/);
  assert.throws(() => privateSpinConfig({ stake: 5000, bombPot: true }), /Bomb pots/);
});

test('public registry distinguishes existing adapters and planned games without exposing accounts', async () => {
  const catalog = await srv.get('/api/marketplace/management');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.mode, 'enforce');
  assert.equal(catalog.data.plugins.filter((plugin) => plugin.implemented).length, 3);
  assert.equal(catalog.data.plugins.find((plugin) => plugin.id === 'sit-and-go-manager').implemented, false);
  assert.equal((await srv.get('/api/marketplace/management/me')).status, 401);
  const mine = await srv.get('/api/marketplace/management/me', { token: alice });
  assert.ok(mine.data.access.every((entry) => !entry.can_manage && !entry.active));
});

test('server denies unpaid cash, Spin and tournament creation including platform administrators', async () => {
  for (const game of ['holdem', 'spingold']) {
    const denied = await srv.post('/api/tables/host', { token: alice, body: { game, stake: 5000 } });
    assert.equal(denied.status, 402);
    assert.equal(denied.data.code, 'paid_plugin_required');
  }
  assert.equal((await srv.post('/api/tournaments/host', { token: alice, body: { name: 'Unpaid event' } })).status, 402);
  assert.equal((await srv.post('/api/admin/tables', { token: admin, body: { game: 'holdem' } })).status, 402);
  const tables = await srv.get('/api/admin/tables', { token: admin });
  const source = tables.data.tables.find((table) => table.game === 'holdem');
  assert.equal((await srv.post('/api/admin/tables/duplicate', { token: admin, body: { id: source.id } })).status, 402);
  assert.equal((await srv.get('/api/admin/stats', { token: alice })).status, 403);
});

test('legacy manual grants and future catalog labels cannot unlock a paid management plugin', async () => {
  const manual = await srv.post('/api/admin/marketplace/entitlements', { token: admin, body: { product_id: CASH, user_id: aliceId } });
  assert.equal(manual.status, 409);
  const published = await call('PATCH', '/api/admin/marketplace/products/sit-and-go-manager', admin, { status: 'available' });
  assert.equal(published.status, 409);
  const free = await call('PATCH', `/api/admin/marketplace/products/${CASH}`, admin, { pricing: 'free' });
  assert.equal(free.status, 400);
  const foreign = await call('PATCH', `/api/admin/marketplace/products/${CASH}`, admin, { currency: 'EUR' });
  assert.equal(foreign.status, 400);
});

test('only the private administrator can configure verified payments and credit balances', async () => {
  for (const [route, body] of [
    ['/publishers', { ownerUserId: aliceId, displayName: 'Fake', kind: 'individual', nervixpayMerchantId: 'fake' }],
    ['/offers', { productId: CASH, publisherId: 'fake' }],
    ['/orders', { buyerUserId: aliceId, productId: CASH, idempotencyKey: 'fake' }],
    ['/payments/confirm', { paymentId: 'fake' }],
  ]) {
    assert.equal((await call('POST', ROOT + route, alice, body)).status, 403);
    assert.equal((await call('POST', ROOT + route, null, body)).status, 401);
  }
  const forgedOwner = await srv.post('/api/marketplace/publisher', { token: alice,
    body: { ownerUserId: adminId, displayName: 'Forged', kind: 'individual', nervixpayMerchantId: 'fake' } });
  assert.equal(forgedOwner.status, 400);
  publisher = (await success('/publishers', { ownerUserId: adminId, displayName: 'Fixture Publisher', kind: 'company', nervixpayMerchantId: 'merchant-fixture' })).publisher;
  await success(`/publishers/${publisher.id}/review`, { status: 'approved', reason: 'Merchant ownership verified in test fixture' });
  await success(`/publishers/${publisher.id}/credits`, { amountCents: 2000, reference: 'topup-fixture-1', kind: 'confirmed_topup' });
  for (const productId of [CASH, TOURNEY, SPIN]) {
    assert.equal((await call('PATCH', `/api/admin/marketplace/products/${productId}`, admin, { pricing: 'monthly', price_cents: 10000 })).status, 200);
    await success('/offers', { productId, publisherId: publisher.id });
  }
});

test('verified sale unlocks its own feature once and keeps the customer active at zero publisher credits', async () => {
  const before = await srv.balance(alice);
  cashOrder = await buy(CASH);
  assert.equal(cashOrder.status, 'paid');
  const balance = (await finance('')).data.publishers[0].balance;
  assert.equal(balance.available_cents, 0);
  assert.equal(balance.reserved_cents, 0);
  const access = (await srv.get('/api/marketplace/management/me', { token: alice })).data.access;
  assert.equal(access.find((entry) => entry.product_id === CASH).can_manage, true);
  assert.equal(access.find((entry) => entry.product_id === SPIN).can_manage, false);
  assert.equal((await srv.get('/api/me', { token: alice })).data.user.is_admin, false);
  assert.equal(await srv.balance(alice), before);
  const create = await srv.post('/api/tables/host', { token: alice, body: { name: 'Paid private table', game: 'holdem', owner_id: adminId } });
  assert.equal(create.status, 200, JSON.stringify(create.data)); cashTable = create.data.id;
  assert.ok((await srv.get('/api/tables/host', { token: alice })).data.tables.some((table) => table.id === cashTable));
  assert.equal((await srv.del(`/api/tables/host/${cashTable}`, { token: bob })).status, 404);
  const blocked = await finance('/orders', { buyerUserId: aliceId, productId: SPIN, idempotencyKey: crypto.randomUUID() });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'publisher_credit_required');
  assert.equal((await srv.get('/api/admin/stats', { token: alice })).status, 403, 'paid access never promotes a user');
});

test('Spin hosting derives fixed engine parameters and tournament access is independent', async () => {
  await success(`/publishers/${publisher.id}/credits`, { amountCents: 6000, reference: 'topup-fixture-2', kind: 'confirmed_topup' });
  await buy(SPIN);
  assert.equal((await srv.post('/api/tournaments/host', { token: alice, body: { name: 'Still unpaid' } })).status, 402);
  const badStake = await srv.post('/api/tables/host', { token: alice, body: { game: 'spingold', stake: 1 } });
  assert.equal(badStake.status, 400);
  const spin = await srv.post('/api/tables/host', { token: alice,
    body: { game: 'spingold', stake: 5000, seats: 9, sb: 999, bb: 999, max_buyin: 999999 } });
  assert.equal(spin.status, 200, JSON.stringify(spin.data));
  const row = (await srv.get('/api/tables/host', { token: alice })).data.tables.find((table) => table.id === spin.data.id);
  assert.equal(row.game, 'spingold'); assert.equal(row.seats, 3);
  assert.equal(row.sb, 10); assert.equal(row.bb, 20); assert.equal(row.min_buyin, 5000); assert.equal(row.max_buyin, 5000);
  await buy(TOURNEY);
  assert.equal((await srv.post('/api/tournaments/host', { token: alice, body: { name: 'Paid scheduled event' } })).status, 200);
});

test('refund removes new management rights while preserving owner reads, moderation and cleanup', async () => {
  await success(`/orders/${cashOrder.id}/refund`, { refundReference: 'verified-full-refund-fixture' });
  assert.equal((await srv.post('/api/tables/host', { token: alice, body: { game: 'holdem' } })).status, 402);
  assert.equal((await srv.get('/api/tables/host', { token: alice })).status, 200);
  assert.equal((await srv.get(`/api/tables/host/${cashTable}/mutes`, { token: alice })).status, 200);
  assert.equal((await srv.del(`/api/tables/host/${cashTable}`, { token: alice })).status, 200);
  const access = (await srv.get('/api/marketplace/management/me', { token: alice })).data.access;
  assert.equal(access.find((entry) => entry.product_id === CASH).active, false);
  assert.equal(access.find((entry) => entry.product_id === SPIN).active, true);
});

test('paid cash admin rights cannot reclassify an existing Spin table without the Spin plugin', async () => {
  await buy(CASH, adminId);
  const spin = (await srv.get('/api/admin/tables', { token: admin })).data.tables.find((table) => table.game === 'spingold');
  assert.equal((await srv.post('/api/admin/tables', { token: admin, body: { ...spin, game: 'holdem' } })).status, 402);
  assert.equal((await srv.post('/api/admin/tables/duplicate', { token: admin, body: { id: spin.id } })).status, 402);
});

test('admin management checks use the same normalized game and ID as the table upsert', async () => {
  const spin = (await srv.get('/api/admin/tables', { token: admin })).data.tables.find((table) => table.game === 'spingold');
  const coercionId = 'guard-game-coercion';
  // The existing config parser normalizes this JSON array to "spingold".
  // Authorization must therefore require Spin, rather than inspecting the array.
  const coerced = await srv.post('/api/admin/tables', { token: admin, body: { ...spin, id: coercionId, game: ['spingold'] } });
  assert.equal(coerced.status, 402);
  assert.equal(coerced.data.product_id, SPIN);
  const database = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  const canonicalId = 'guard-long-spin-'.padEnd(60, 'x');
  try {
    assert.equal(database.prepare('SELECT 1 FROM tables WHERE id = ?').get(coercionId), undefined);
    const fixture = { ...database.prepare('SELECT * FROM tables WHERE id = ?').get(spin.id), id: canonicalId };
    const columns = Object.keys(fixture);
    database.prepare(`INSERT INTO tables (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...columns.map((column) => fixture[column]));
    // The upsert truncates IDs to 60 characters. Its old-family lookup must use
    // that same target, otherwise a suffix hides the existing Spin row.
    const truncated = await srv.post('/api/admin/tables', { token: admin,
      body: { ...spin, id: `${canonicalId}-ignored-suffix`, game: 'holdem' } });
    assert.equal(truncated.status, 402);
    assert.equal(truncated.data.product_id, SPIN);
    assert.equal(database.prepare('SELECT game FROM tables WHERE id = ?').get(canonicalId).game, 'spingold');
  } finally { database.close(); }
});

test('expiry blocks new creation without deleting existing resources or disabling gameplay APIs', async () => {
  const database = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  database.prepare("UPDATE marketplace_paid_access SET expires_at = ? WHERE user_id = ? AND product_id = ?")
    .run('2000-01-01T00:00:00.000Z', aliceId, SPIN);
  database.close();
  assert.equal((await srv.post('/api/tables/host', { token: alice, body: { game: 'spingold', stake: 5000 } })).status, 402);
  const existing = await srv.get('/api/tables/host', { token: alice });
  assert.ok(existing.data.tables.some((table) => table.game === 'spingold'));
  assert.equal((await srv.get('/api/spin/info?buyin=5000', { token: alice })).status, 200);
});
