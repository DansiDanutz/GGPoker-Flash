// SPDX-License-Identifier: AGPL-3.0-only
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import { ensureMarketplaceSchema } from './marketplace.js';

let srv;
let admin;
let alice;
let bob;
let aliceId;
let bobId;
let availableId;
let requestId;
let entitlementId;

async function call(method, route, { token, body, headers = {} } = {}) {
  const res = await fetch(srv.base + route, {
    method,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}

const adminCall = (method, route, body) => call(method, `/api/admin/marketplace${route}`, { token: admin, body });
const createProduct = async (overrides = {}) => {
  const response = await adminCall('POST', '/products', {
    slug: `test-${crypto.randomUUID()}`, name: 'Serviciu de test', summary: 'Un serviciu administrat manual.',
    category: 'hosting', delivery: 'hosted_service', status: 'draft', pricing: 'quote', price_cents: null,
    currency: 'EUR', features: ['Configurare asistată'], ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
};

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  const register = async (login, nick) => {
    const result = await srv.post('/api/auth/register', { body: { login, nick, password: 'marketplace-test-password' } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  const first = await register('market_alice', 'Marketplace Alice');
  const second = await register('market_bob', 'Marketplace Bob');
  alice = first.token; aliceId = first.user.id;
  bob = second.token; bobId = second.user.id;
});

after(async () => { if (srv) await srv.stop(); });

test('legacy default catalog copy migrates to English without overwriting custom content', () => {
  const db = new DatabaseSync(':memory:');
  ensureMarketplaceSchema(db);
  db.prepare('UPDATE marketplace_settings SET title=? WHERE id=1').run('Mai mult pentru comunitatea ta.');
  db.prepare('UPDATE marketplace_settings SET subtitle=? WHERE id=1').run('Custom operator subtitle');
  db.prepare('UPDATE marketplace_products SET name=?,summary=? WHERE id=?')
    .run('Găzduire pentru club', 'Custom operator summary', 'club-hosting');

  ensureMarketplaceSchema(db);

  const settings = db.prepare('SELECT title,subtitle FROM marketplace_settings WHERE id=1').get();
  const product = db.prepare('SELECT name,summary,description,features_json FROM marketplace_products WHERE id=?').get('club-hosting');
  assert.equal(settings.title, 'More for your community.');
  assert.equal(settings.subtitle, 'Custom operator subtitle');
  assert.equal(product.name, 'Club hosting');
  assert.equal(product.summary, 'Custom operator summary');
  assert.match(product.description, /^A service in preparation/);
  assert.deepEqual(JSON.parse(product.features_json), ['Assisted configuration', 'Agreed hosting capacity', 'Organizer support']);
  db.close();
});

test('public catalog has honest seeded products, safe settings and no checkout', async () => {
  const result = await srv.get('/api/marketplace');
  assert.equal(result.status, 200);
  assert.equal(result.data.checkout_enabled, false);
  assert.equal(result.data.products.length, 11);
  const clubEntry = result.data.products.find((product) => product.id === 'club-entry');
  assert.deepEqual({ status: clubEntry.status, pricing: clubEntry.pricing, price_cents: clubEntry.price_cents, currency: clubEntry.currency }, { status: 'available', pricing: 'one_time', price_cents: 100, currency: 'USD' });
  const squeeze = result.data.products.find((product) => product.id === 'squeeze-3d');
  assert.deepEqual({ status: squeeze.status, pricing: squeeze.pricing, price_cents: squeeze.price_cents, currency: squeeze.currency }, { status: 'available', pricing: 'monthly', price_cents: 100, currency: 'USD' });
  assert.ok(result.data.products.filter((product) => !['club-entry', 'squeeze-3d'].includes(product.id)).every((product) => product.pricing === 'quote' && product.price_cents === null));
  const implemented = new Set(['club-entry', 'squeeze-3d', 'cash-games-manager', 'tournaments-manager', 'spin-and-go-manager']);
  assert.ok(result.data.products.every((product) => product.status === (implemented.has(product.id) ? 'available' : 'coming_soon')));
  assert.deepEqual(Object.keys(result.data).sort(), ['checkout_enabled', 'products', 'settings']);
  assert.deepEqual(Object.keys(result.data.settings).sort(), ['contact_note', 'requests_enabled', 'subtitle', 'title']);
  assert.deepEqual(Object.keys(result.data.products[0]).sort(), ['category', 'created_at', 'currency', 'delivery', 'description', 'featured', 'features', 'id', 'name', 'price_cents', 'pricing', 'slug', 'sort_order', 'status', 'summary', 'updated_at']);
  assert.equal((await srv.get('/api/marketplace/me')).status, 401);
  assert.equal((await srv.post('/api/marketplace/requests', { body: { product_id: 'club-hosting' } })).status, 401);
});

test('admin catalog and every mutation require an administrator', async () => {
  for (const [method, route, body] of [
    ['GET', '', undefined],
    ['POST', '/products', { name: 'No access' }],
    ['PATCH', '/products/club-hosting', { status: 'available' }],
    ['PATCH', '/settings', { requests_enabled: false }],
    ['PATCH', '/requests/1', { status: 'approved' }],
    ['POST', '/entitlements', { product_id: 'club-hosting', user_id: aliceId }],
    ['PATCH', '/entitlements/1', { status: 'revoked' }],
  ]) {
    assert.equal((await call(method, `/api/admin/marketplace${route}`, { body })).status, 401, `${method} ${route} anonymous`);
    assert.equal((await call(method, `/api/admin/marketplace${route}`, { token: alice, body })).status, 403, `${method} ${route} player`);
  }
});

test('draft products remain private, publication persists and invalid edits are atomic', async () => {
  const product = await createProduct({ slug: 'operator-test', name: 'Asistență administrată', description: 'Detalii pentru organizator.' });
  availableId = product.id;
  assert.equal(product.status, 'draft');
  assert.ok(!(await srv.get('/api/marketplace')).data.products.some((item) => item.id === product.id));
  const published = await adminCall('PATCH', `/products/${product.id}`, { status: 'available', pricing: 'monthly', price_cents: 1500, featured: true });
  assert.equal(published.status, 200);
  assert.equal(published.data.product.price_cents, 1500);
  assert.equal(published.data.product.summary, product.summary, 'partial edits preserve other fields');
  assert.ok((await srv.get('/api/marketplace')).data.products.some((item) => item.id === product.id));
  const invalid = await adminCall('PATCH', `/products/${product.id}`, { name: 'Do not save', price_cents: 1.5 });
  assert.equal(invalid.status, 400);
  assert.equal((await adminCall('GET', '')).data.products.find((item) => item.id === product.id).name, 'Asistență administrată');
  assert.equal((await adminCall('POST', '/products', { slug: 'operator-test', name: 'Duplicate' })).status, 409);
  assert.equal((await adminCall('PATCH', `/products/${product.id}`, { delivery: 'unknown' })).status, 400);
  assert.equal((await adminCall('PATCH', `/products/${product.id}`, { featured: 'true' })).status, 400);
  assert.equal((await adminCall('PATCH', `/products/${product.id}`, { features: ['x'.repeat(161)] })).status, 400);
  assert.equal((await adminCall('PATCH', `/products/${product.id}`, { checkout_enabled: true })).status, 400);
  assert.equal((await adminCall('DELETE', `/products/${product.id}`)).status, 405);
  const archived = await createProduct({ name: 'Archived test', status: 'archived' });
  assert.ok(!(await srv.get('/api/marketplace')).data.products.some((item) => item.id === archived.id));
  assert.equal((await srv.post('/api/marketplace/requests', { token: alice, body: { product_id: archived.id } })).status, 404);
});

test('public content is editable, bounded and requests can be paused', async () => {
  const changed = await adminCall('PATCH', '/settings', { title: 'Servicii pentru comunitate', requests_enabled: false });
  assert.equal(changed.status, 200);
  assert.equal((await srv.get('/api/marketplace')).data.settings.title, 'Servicii pentru comunitate');
  assert.equal((await srv.post('/api/marketplace/requests', { token: alice, body: { product_id: 'club-hosting' } })).status, 403);
  assert.equal((await adminCall('PATCH', '/settings', { title: 'x'.repeat(141) })).status, 400);
  assert.equal((await adminCall('PATCH', '/settings', { checkout_enabled: true })).status, 400);
  assert.equal((await adminCall('PATCH', '/settings', { requests_enabled: 'true' })).status, 400);
  assert.equal((await adminCall('PATCH', '/settings', { requests_enabled: true })).status, 200);
});

test('requests belong to the caller, duplicate retries are idempotent and approval does not provision access', async () => {
  const invalid = await srv.post('/api/marketplace/requests', { token: alice, body: { product_id: availableId, message: 'x'.repeat(2001) } });
  assert.equal(invalid.status, 400);
  assert.equal((await srv.post('/api/marketplace/requests', { token: alice, body: { product_id: availableId, user_id: bobId } })).status, 400);
  const result = await srv.post('/api/marketplace/requests', { token: alice, body: { product_id: availableId, message: 'Doresc o ofertă pentru club.' } });
  assert.equal(result.status, 201);
  requestId = result.data.request.id;
  assert.equal(result.data.request.user_id, aliceId);
  const repeated = await srv.post('/api/marketplace/requests', { token: alice, body: { product_id: availableId, message: 'Retry should not overwrite' } });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.request.id, requestId);
  assert.equal(repeated.data.request.message, 'Doresc o ofertă pentru club.');
  assert.equal(repeated.data.duplicate, true);
  assert.equal((await srv.get('/api/marketplace/me', { token: bob })).data.requests.length, 0);
  assert.equal((await srv.get(`/api/marketplace/me?user_id=${aliceId}`, { token: bob })).data.requests.length, 0);
  const all = await adminCall('GET', '');
  assert.equal(all.data.requests.find((item) => item.id === requestId).user_nick, 'Marketplace Alice');
  assert.equal((await adminCall('PATCH', `/requests/${requestId}`, { status: 'approved', response: 'Te contactăm pentru configurare.' })).status, 200);
  const mine = (await srv.get('/api/marketplace/me', { token: alice })).data;
  assert.equal(mine.requests.find((item) => item.id === requestId).response, 'Te contactăm pentru configurare.');
  assert.equal(mine.entitlements.length, 0);
});

test('manual access requires an available product, protects notes, expires and revokes without charging balances', async () => {
  const before = await srv.balance(alice);
  assert.equal((await adminCall('POST', '/entitlements', { product_id: 'club-hosting', user_id: aliceId })).status, 409);
  assert.equal((await adminCall('POST', '/entitlements', { product_id: availableId, user_id: 99999999 })).status, 404);
  assert.equal((await adminCall('POST', '/entitlements', { product_id: availableId, user_id: aliceId, expires_at: '2020-01-01T00:00:00Z' })).status, 400);
  assert.equal((await adminCall('POST', '/entitlements', { product_id: availableId, user_id: aliceId, expires_at: '2099-01-01T00:00' })).status, 400);
  const expires = new Date(Date.now() + 86400_000).toISOString();
  const grant = await adminCall('POST', '/entitlements', { product_id: availableId, user_id: aliceId, expires_at: expires, note: 'Internal operator provisioning note' });
  assert.equal(grant.status, 200);
  entitlementId = grant.data.entitlement.id;
  assert.equal(grant.data.entitlement.note, 'Internal operator provisioning note');
  const mine = (await srv.get('/api/marketplace/me', { token: alice })).data.entitlements[0];
  assert.equal(mine.status, 'active');
  assert.equal(mine.expires_at, expires);
  assert.equal('note' in mine, false);
  assert.equal('user_nick' in mine, false);
  assert.equal((await srv.get('/api/marketplace/me', { token: bob })).data.entitlements.length, 0);
  assert.equal((await adminCall('GET', '')).data.stats.active_access, 1);
  assert.equal((await adminCall('POST', '/entitlements', { product_id: availableId, user_id: aliceId, note: 'Renewed manually' })).data.entitlement.id, entitlementId);
  assert.equal((await adminCall('GET', '')).data.entitlements.length, 1, 'regrant updates instead of duplicating');
  assert.equal((await adminCall('PATCH', `/entitlements/${entitlementId}`, { status: 'active' })).status, 400);
  assert.equal((await adminCall('PATCH', `/entitlements/${entitlementId}`, { status: 'revoked' })).status, 200);
  assert.equal((await adminCall('GET', '')).data.stats.active_access, 0);
  assert.equal((await srv.get('/api/marketplace/me', { token: alice })).data.entitlements[0].status, 'revoked');
  assert.equal(await srv.balance(alice), before);
  const audit = await srv.get('/api/admin/audit?action=marketplace_access_revoke', { token: admin });
  assert.equal(audit.status, 200);
  assert.equal(audit.data.log.length, 1);
  assert.equal(audit.data.log[0].actor, 'admin');
  assert.equal(JSON.parse(audit.data.log[0].detail).entitlement_id, entitlementId);
});

test('request limits are persisted and duplicate retries do not consume the allowance', async () => {
  for (let index = 0; index < 6; index += 1) {
    const product = await createProduct({ name: `Rate limit ${index}`, status: 'available' });
    const response = await srv.post('/api/marketplace/requests', { token: bob, body: { product_id: product.id } });
    assert.equal(response.status, index < 5 ? 201 : 429, JSON.stringify(response.data));
    if (index === 0) {
      for (let retry = 0; retry < 3; retry += 1) assert.equal((await srv.post('/api/marketplace/requests', { token: bob, body: { product_id: product.id } })).status, 200);
    }
  }
});

test('catalog edits, review decisions and revocation survive a server restart', async () => {
  const dataDir = srv.dataDir;
  await srv.stop();
  srv = await startServer({ dataDir });
  const catalog = await srv.get('/api/marketplace');
  assert.equal(catalog.data.settings.title, 'Servicii pentru comunitate');
  assert.equal(catalog.data.products.find((item) => item.id === availableId).price_cents, 1500);
  const mine = await srv.get('/api/marketplace/me', { token: alice });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.requests.find((item) => item.id === requestId).status, 'approved');
  assert.equal(mine.data.entitlements.find((item) => item.id === entitlementId).status, 'revoked');
  assert.equal(catalog.data.products.filter((item) => item.id === 'club-hosting').length, 1);
  const product = await createProduct({ name: 'Rate after restart', status: 'available' });
  assert.equal((await srv.post('/api/marketplace/requests', { token: bob, body: { product_id: product.id } })).status, 429);
});

test('production retains the network restriction for marketplace administration', async () => {
  const production = await startServer({ env: { NODE_ENV: 'production', GGPOKER_TRUST_PROXY: '1', GGPOKER_ADMIN_ALLOW: '', GGPOKER_ADMIN_PASSWORD: 'test-only-marketplace-admin-password' } });
  try {
    const publicRead = await production.get('/api/marketplace', { headers: { 'x-forwarded-for': '203.0.113.5' } });
    assert.equal(publicRead.status, 200);
    const refused = await production.get('/api/admin/marketplace', { headers: { 'x-forwarded-for': '203.0.113.5' } });
    assert.equal(refused.status, 403);
    assert.match(refused.data.error, /restricted/i);
    assert.equal((await production.get('/api/admin/marketplace')).status, 403);
  } finally { await production.stop(); }
});
