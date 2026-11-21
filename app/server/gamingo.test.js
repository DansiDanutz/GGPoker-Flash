// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { createGamingo, GAMINGO_PRODUCT_ID } from './gamingo.js';
import { createOrganizerBilling } from './organizer-billing.js';
import { createGamingoRoutes } from './gamingo-routes.js';
import { startServer } from './test-helpers.js';

function fixture(t, connections = {}) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users(id) VALUES(1),(2);`);
  const state = { member: true, paid: true, approved: true, credits: 2000, mode: 'enforce' };
  const billing = { get mode() { return state.mode; }, account: () => ({ memberships: { organizer: { active: state.member } } }) };
  const commerce = { hasPaidAccess: (id, product, time) => id === 1 && product === GAMINGO_PRODUCT_ID && time > 0 && state.paid,
    listOffers: () => [{ product_id: GAMINGO_PRODUCT_ID, publisher_id: 'publisher' }],
    getPublisher: () => ({ id: 'publisher', status: state.approved ? 'approved' : 'suspended' }),
    balance: () => ({ available_cents: state.credits }) };
  const gamingo = createGamingo({ db, billing, commerce, connections });
  return { db, state, gamingo, billing, commerce };
}
const completeConnection = () => ({ enabled: true, operator_id: 'private-operator-reference', balance_model: 'organizer_cash_chips',
  arrangement: 'platform_sub_operator', evidence: Object.fromEntries([
    'operator_arrangement', 'marketplace_distribution', 'balance_model', 'markets_and_games', 'supplier_pricing', 'source_distribution',
  ].map(key => [key, `private-agreement-${key}`])) });

test('Gamingo follows organizer-paid commerce with separate gameplay balances', t => {
  const { gamingo } = fixture(t);
  const model = gamingo.model();
  assert.equal(model.commission_bps, 2000);
  assert.equal(model.payment_provider, 'nervixpay');
  assert.equal(model.commission_source, 'publisher_prepaid_commission_credits');
  assert.equal(model.organizer_membership_required, true);
  assert.equal(model.player_plugin_purchase_required, false);
  assert.deepEqual(model.gameplay_balances, ['play_money', 'organizer_cash_chips']);
  assert.equal(model.automatic_balance_conversion, false);
  assert.equal(model.checkout_enabled, false);
});

test('supplier configuration cannot turn unfinished integration into a live game', t => {
  const connection = completeConnection();
  const { gamingo, db } = fixture(t, { 1: connection });
  connection.enabled = false; // A later mutation does not change reviewed config.
  const before = db.prepare('SELECT total_changes() n').get().n;
  const status = gamingo.readiness(1);
  assert.equal(status.supplier_configuration_complete, true);
  assert.equal(status.paid_plugin_access_active, true);
  assert.equal(status.can_launch, false);
  assert.deepEqual(status.blockers, ['provider_wallet_not_implemented', 'provider_wallet_not_certified', 'production_release_required']);
  assert.equal(status.provider_wallet_callbacks_enabled, false);
  assert.equal(db.prepare('SELECT total_changes() n').get().n, before, 'readiness never writes to any ledger');
  assert.ok(!JSON.stringify(status).includes('private-agreement'));
  assert.ok(!JSON.stringify(status).includes('private-operator-reference'));
});

test('membership, product entitlement, publisher review and commission funds are separate gates', t => {
  const { gamingo, state } = fixture(t, { 1: completeConnection() });
  for (const [key, value, code] of [
    ['mode', 'off', 'organizer_billing_disabled'],
    ['member', false, 'organizer_membership_required'],
    ['paid', false, 'paid_plugin_required'],
    ['approved', false, 'approved_publisher_required'],
    ['credits', 0, 'publisher_commission_credit_required'],
  ]) {
    const old = state[key]; state[key] = value;
    const status = gamingo.readiness(1);
    assert.ok(status.blockers.includes(code), code);
    assert.equal(status.can_launch, false);
    state[key] = old;
  }
  state.credits = 0;
  assert.equal(gamingo.readiness(1).paid_plugin_access_active, true, 'funding pause does not revoke purchased access');
  assert.equal(gamingo.readiness(2).balance_model, null, 'no other organizer connection is reused');
  assert.equal(gamingo.readiness(2).paid_plugin_access_active, false);
});

test('configuration fails closed and inactive organizers cannot use readiness', t => {
  const { db, billing, commerce, gamingo } = fixture(t);
  for (const connections of ['invalid-json', [], { 0: completeConnection() }, { 1: { ...completeConnection(), secret: 'do-not-store-here' } },
    { 1: { ...completeConnection(), balance_model: 'service_credits' } },
    { 1: { ...completeConnection(), evidence: { marketplace_distribution: true } } }]) {
    assert.throws(() => createGamingo({ db, billing, commerce, connections }), { status: 503 });
  }
  assert.throws(() => gamingo.readiness('1'), { status: 400 });
  assert.throws(() => gamingo.readiness(999), { status: 403 });
  db.exec('UPDATE users SET banned=1 WHERE id=1');
  assert.throws(() => gamingo.readiness(1), { status: 403 });
  db.exec("UPDATE users SET deleted_at='2026-11-20' WHERE id=2");
  assert.throws(() => gamingo.readiness(2), { status: 403 });
});

test('catalog checks assignment and current organizer membership before opening the provider', async t => {
  const { db, commerce } = fixture(t);
  let time = Date.UTC(2026, 0, 1), actor = 1, opened = 0, calls = 0;
  const billing = createOrganizerBilling({ db, now: () => time });
  const gamingo = createGamingo({ db, billing, commerce });
  const route = createGamingoRoutes({ gamingo, catalogOwner: '1', requireUser: () => ({ id: actor }),
    catalogProvider: () => { opened++; return { games: async () => { calls++; return { games: [] }; } }; },
    json: (res, status) => { res.status = status; } });
  async function check(status, expected) {
    const res = { setHeader() {} };
    await route({ method: 'GET' }, res, new URL('http://localhost/api/marketplace/gamingo/catalog'));
    assert.deepEqual([res.status, opened, calls], [status, expected, expected]);
  }
  await check(403, 0); // Assigned nonmember, including when general billing enforcement is off.
  const grant = db.prepare('INSERT INTO organizer_billing_memberships VALUES (?,?,1,?)');
  const expiry = new Date(time + 1000).toISOString();
  grant.run(1, 'contributor', expiry);
  await check(403, 0);
  grant.run(1, 'organizer', expiry);
  grant.run(2, 'organizer', expiry);
  actor = 2; await check(403, 0); // Active but unassigned.
  actor = 1; await check(200, 1);
  time += 1000; await check(403, 1); // Same authenticated account, now expired.
});

test('HTTP integration is tenant-scoped, unsellable and cannot launch or change balances', async t => {
  const server = await startServer(); t.after(() => server.stop());
  const admin = await server.login('admin', 'admin123');
  const registered = await server.post('/api/auth/register', { body: { login: 'gamingo_player', nick: 'Gamingo player', password: 'gamingo-test-password' } });
  const token = registered.data.token, userId = registered.data.user.id;
  const before = await server.balance(token);
  const reader = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'));
  t.after(() => reader.close());
  const ledgers = ['organizer_billing_accounts', 'organizer_billing_ledger', 'organizer_chip_accounts',
    'organizer_chip_journals', 'marketplace_commission_ledger', 'marketplace_paid_access'];
  const snapshot = () => Object.fromEntries(ledgers.map(table => [table, reader.prepare(`SELECT * FROM ${table}`).all()]));
  const balancesBefore = snapshot();
  assert.equal((await server.get('/api/marketplace/gamingo')).data.live_sessions_enabled, false);
  assert.equal((await server.get('/api/marketplace/gamingo/me')).status, 401);
  assert.equal((await server.get('/api/marketplace/gamingo/catalog')).status, 401);
  assert.equal((await server.get('/api/marketplace/gamingo/catalog?organizerId=1', { token })).status, 403);
  assert.equal((await server.post('/api/marketplace/gamingo/catalog', { token })).status, 405);
  const status = await server.get('/api/marketplace/gamingo/me?organizerId=1', { token });
  assert.equal(status.data.organizer_id, userId);
  const catalog = await server.get('/api/marketplace/management');
  assert.equal(catalog.data.plugins.find(row => row.id === GAMINGO_PRODUCT_ID).implemented, false);
  assert.equal((await server.post('/api/marketplace/gamingo/sessions', { token, body: { gameId: 'demo-game' } })).status, 503);
  assert.equal((await server.post('/api/marketplace/gamingo/sessions', { token, body: { gameId: 'demo-game', organizerId: 1 } })).status, 400);
  assert.equal((await server.post('/api/marketplace/gamingo/sessions', { token, body: { gameId: 'demo-game', balance_model: 'USD' } })).status, 400);
  assert.equal((await server.post('/api/marketplace/gamingo/wallet/credit', { token, body: { amount: 100000 } })).status, 404);
  assert.equal((await server.post('/api/marketplace/gamingo/me', { token, body: {} })).status, 405);
  const publish = await server.put('/api/marketplace/gamingo', { token: admin, body: { live_sessions_enabled: true } });
  assert.equal(publish.status, 405);
  const product = await fetch(server.base + `/api/admin/marketplace/products/${GAMINGO_PRODUCT_ID}`, {
    method: 'PATCH', headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'available' }),
  });
  assert.equal(product.status, 409);
  assert.equal((await server.post('/api/admin/marketplace/commerce/orders', { token: admin,
    body: { buyerUserId: userId, productId: GAMINGO_PRODUCT_ID, idempotencyKey: 'cannot-buy-unfinished-integration' } })).status, 409);
  assert.equal(await server.balance(token), before);
  assert.deepEqual(snapshot(), balancesBefore, 'blocked requests cannot change service, gameplay or commission ledgers');
});
