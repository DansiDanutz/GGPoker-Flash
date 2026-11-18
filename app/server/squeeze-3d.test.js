// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerBilling } from './organizer-billing.js';
import { SQUEEZE_3D_PRICES, squeezeTableEconomy, createSqueeze3dRoutes } from './squeeze-3d.js';
import { startServer } from './test-helpers.js';

function fixture(start = '2026-01-31T12:00:00Z') {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT,is_admin INTEGER DEFAULT 0);
    CREATE TABLE audit_log(actor TEXT,action TEXT,detail TEXT);
    CREATE TABLE tables(id TEXT PRIMARY KEY,chip_economy INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tournaments(id TEXT PRIMARY KEY,chip_economy INTEGER NOT NULL DEFAULT 0);
    INSERT INTO users VALUES (1,0,NULL,1),(2,0,NULL,0);
  `);
  let time = Date.parse(start);
  const billing = createOrganizerBilling({ db, now: () => time, mode: 'enforce' });
  const fund = (amount = 2000) => billing.credit({ userId: 2, amountCents: amount, reference: `fund-${amount}`, actor: 1 });
  return { db, billing, fund, set: (value) => { time = Date.parse(value); } };
}

test('squeeze prices are $1 monthly and $10 lifetime', () => {
  assert.deepEqual(SQUEEZE_3D_PRICES, { monthly: 100, lifetime: 1000 });
  const f = fixture();
  assert.equal(f.billing.squeeze3dAccount(2).mode, 'enforce');
  assert.equal(f.billing.squeeze3dAccount(2).purchases_enabled, true);
});

test('monthly purchase is atomic, replay-safe, conflict-safe and uses calendar-month expiry', () => {
  const f = fixture(); f.fund();
  const first = f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'squeeze-1' });
  assert.equal(first.entitlement.expires_at, '2026-02-28T12:00:00.000Z');
  assert.deepEqual(f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'squeeze-1' }), first);
  assert.throws(() => f.billing.purchaseSqueeze3d({ userId: 2, plan: 'lifetime', idempotencyKey: 'squeeze-1' }), (error) => error.code === 'idempotency_conflict');
  assert.equal(f.billing.account(2).balance_cents, 1900);
  assert.equal(f.billing.history(2).filter((row) => row.kind === 'squeeze_3d').length, 1);
  f.set('2026-02-20T12:00:00Z');
  assert.equal(f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'squeeze-2' }).entitlement.expires_at, '2026-03-28T12:00:00.000Z');
});

test('insufficient credits leave no entitlement, operation or debit behind', () => {
  const f = fixture();
  assert.throws(() => f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'unfunded' }), (error) => error.code === 'insufficient_credit');
  assert.equal(f.billing.squeeze3dAccount(2).entitlement.active, false);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM organizer_billing_operations WHERE idempotency_key='unfunded'").get().n, 0);
  assert.equal(f.billing.history(2).length, 0);
  assert.throws(() => f.billing.purchaseSqueeze3d({ userId: 2, plan: 'annual', idempotencyKey: 'bad-plan' }));
  assert.equal(f.billing.history(2).length, 0);
});

test('expired monthly renewal starts from now and a fresh lifetime repeat cannot debit again', () => {
  const f = fixture(); f.fund();
  f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'old-month' });
  f.set('2026-03-15T12:00:00Z');
  assert.equal(f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'new-month' }).entitlement.expires_at, '2026-04-15T12:00:00.000Z');
  f.billing.purchaseSqueeze3d({ userId: 2, plan: 'lifetime', idempotencyKey: 'upgrade' });
  const balance = f.billing.account(2).balance_cents;
  assert.throws(() => f.billing.purchaseSqueeze3d({ userId: 2, plan: 'lifetime', idempotencyKey: 'fresh-repeat' }), (error) => error.code === 'already_lifetime');
  assert.equal(f.billing.account(2).balance_cents, balance);
});

test('monthly access expires at the exact boundary while lifetime never expires or double-debits', () => {
  const monthly = fixture(); monthly.fund();
  const bought = monthly.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'month' });
  monthly.set(bought.entitlement.expires_at);
  assert.equal(monthly.billing.squeeze3dAccount(2).entitlement.active, false);

  const lifetime = fixture(); lifetime.fund();
  const first = lifetime.billing.purchaseSqueeze3d({ userId: 2, plan: 'lifetime', idempotencyKey: 'life' });
  lifetime.set('2126-01-01T00:00:00Z');
  assert.deepEqual(lifetime.billing.purchaseSqueeze3d({ userId: 2, plan: 'lifetime', idempotencyKey: 'life' }), first);
  assert.deepEqual(lifetime.billing.squeeze3dAccount(2).entitlement, { active: true, plan: 'lifetime', expires_at: null });
  assert.equal(lifetime.billing.squeeze3dAccount(1).entitlement.active, false, 'access is scoped to the authenticated user');
  assert.equal(lifetime.billing.account(2).balance_cents, 1000);
  assert.equal(lifetime.billing.history(2).filter((row) => row.kind === 'squeeze_3d').length, 1);
});

test('table access derives Play Money preview from authoritative live and persisted economy config', () => {
  const f = fixture();
  f.db.exec("INSERT INTO tables VALUES ('play',0),('cash',1); INSERT INTO tournaments VALUES ('weekly-hyphen-id',1)");
  const live = new Map([
    ['tourney-weekly-hyphen-id-2', { table: { cfg: { tournamentId: 'weekly-hyphen-id', chip_economy: 0 } } }],
  ]);
  assert.deepEqual(squeezeTableEconomy(f.db, live, 'play'), { found: true, play_money: true });
  assert.deepEqual(squeezeTableEconomy(f.db, live, 'cash'), { found: true, play_money: false });
  assert.deepEqual(squeezeTableEconomy(f.db, live, 'tourney-weekly-hyphen-id-2'), { found: true, play_money: false });
  assert.deepEqual(squeezeTableEconomy(f.db, live, 'missing'), { found: false, play_money: false });
});

test('authenticated HTTP routes expose account, reject unfunded purchase and fail closed for unknown tables', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce' } });
  try {
    assert.equal((await srv.get('/api/marketplace/squeeze-3d/account')).status, 401);
    const registered = await srv.post('/api/auth/register', { body: { login: 'squeeze_route', nick: 'Squeeze Route', password: 'squeeze-route-password' } });
    const token = registered.data.token;
    const account = await srv.get('/api/marketplace/squeeze-3d/account', { token });
    assert.equal(account.status, 200);
    assert.equal(account.data.purchases_enabled, true);
    assert.deepEqual(account.data.product.prices, { monthly_cents: 100, lifetime_cents: 1000 });
    const listing = (await srv.get('/api/marketplace')).data.products.find((product) => product.id === 'squeeze-3d');
    assert.equal(listing.price_cents, 100);
    assert.match(listing.description, /\$10 for lifetime/);
    const purchase = await srv.post('/api/marketplace/squeeze-3d/purchase', { token, body: { plan: 'monthly', idempotencyKey: 'route-unfunded' } });
    assert.equal(purchase.status, 402);
    assert.equal(purchase.data.code, 'insufficient_credit');
    const missing = await srv.get('/api/marketplace/squeeze-3d/access?tableId=does-not-exist&mode=play_money&preview=true', { token });
    assert.deepEqual(missing.data.access, { allowed: false, reason: 'table_not_found', preview: false });
  } finally { await srv.stop(); }
});


test('access routes distinguish paid cash/tournaments from previews and expire without client overrides', async () => {
  const f = fixture(); f.fund();
  f.db.exec("INSERT INTO tables VALUES ('free',0),('paid',1); INSERT INTO tournaments VALUES ('paid-tourney',1),('free-tourney',0)");
  const liveTables = new Map([
    ['tourney-paid-tourney-1', { table: { cfg: { tournamentId: 'paid-tourney' } } }],
    ['tourney-free-tourney-1', { table: { cfg: { tournamentId: 'free-tourney' } } }],
  ]);
  let response;
  const route = createSqueeze3dRoutes({ db: f.db, billing: f.billing, liveTables,
    json: (_, status, body) => { response = { status, body }; }, requireUser: () => ({ id: 2 }) });
  const access = async (id) => {
    await route({ method: 'GET' }, {}, new URL(`http://localhost/api/marketplace/squeeze-3d/access?tableId=${id}&preview=true&mode=play_money`));
    assert.equal(response.status, 200);
    return response.body.access;
  };
  for (const id of ['free', 'tourney-free-tourney-1']) assert.equal((await access(id)).reason, 'play_money_preview');
  for (const id of ['paid', 'tourney-paid-tourney-1']) assert.equal((await access(id)).allowed, false);
  const bought = f.billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'access-month' });
  for (const id of ['paid', 'tourney-paid-tourney-1']) assert.equal((await access(id)).reason, 'entitled');
  f.set(bought.entitlement.expires_at);
  for (const id of ['paid', 'tourney-paid-tourney-1']) assert.equal((await access(id)).allowed, false);
  f.db.close();
});

test('funded HTTP purchase returns current account and retries exactly one debit', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce' } });
  try {
    const registered = await srv.post('/api/auth/register', { body: { login: 'squeeze_paid', nick: 'Squeeze Paid', password: 'squeeze-route-password' } });
    const { token, user } = registered.data;
    const admin = await srv.login('admin', 'admin123');
    assert.equal((await srv.post('/api/admin/marketplace/billing/credits', { token: admin, body: { userId: user.id, amountCents: 1100, reference: 'squeeze-disposable-funding' } })).status, 200);
    const body = { plan: 'monthly', idempotencyKey: 'http-month' };
    for (let i = 0; i < 2; i++) {
      const result = await srv.post('/api/marketplace/squeeze-3d/purchase', { token, body });
      assert.equal(result.status, 200);
      assert.equal(result.data.service_credit_balance_cents, 1000);
      assert.equal(result.data.entitlement.active, true);
    }
    const invalid = await srv.post('/api/marketplace/squeeze-3d/purchase', { token, body: { plan: ['monthly'], idempotencyKey: 'invalid' } });
    assert.equal(invalid.status, 400);
    const forged = await srv.post('/api/marketplace/squeeze-3d/purchase', { token, body: { ...body, userId: 1 } });
    assert.equal(forged.status, 400);
    assert.equal((await srv.get('/api/marketplace/squeeze-3d/account', { token: admin })).data.entitlement.active, false);
    const lifetime = await srv.post('/api/marketplace/squeeze-3d/purchase', { token, body: { plan: 'lifetime', idempotencyKey: 'http-life' } });
    assert.equal(lifetime.status, 200);
    assert.equal(lifetime.data.service_credit_balance_cents, 0);
    assert.deepEqual(lifetime.data.entitlement, { active: true, plan: 'lifetime', expires_at: null });
  } finally { await srv.stop(); }
});

test('billing off blocks purchases without debiting or disabling previews', () => {
  const f = fixture(); f.fund();
  const billing = createOrganizerBilling({ db: f.db, mode: 'off' });
  assert.equal(billing.squeeze3dAccount(2).purchases_enabled, false);
  assert.throws(() => billing.purchaseSqueeze3d({ userId: 2, plan: 'monthly', idempotencyKey: 'off' }), error => error.code === 'billing_disabled');
  assert.equal(billing.account(2).balance_cents, 2000);
  f.db.close();
});
