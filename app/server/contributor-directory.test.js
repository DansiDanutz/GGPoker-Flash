// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';

test('public contributors expose approved identities and published products, never private commerce data', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  const db = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'));
  t.after(() => db.close());
  const users = db.prepare('SELECT id FROM users LIMIT 2').all();
  const at = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO marketplace_publishers
    (id,owner_user_id,display_name,kind,nervixpay_merchant_id,status,review_reason,created_at,updated_at)
    VALUES (?,?,?,'individual','private-merchant',?,'private-review',?,?)`);
  insert.run('public-creator', users[0].id, 'DansiDanutz', 'approved', at, at);
  insert.run('pending-creator', users[1].id, 'Pending creator', 'pending', at, at);
  const bind = db.prepare('INSERT INTO marketplace_commerce_offers VALUES (?,?,?,?)');
  bind.run('cash-games-manager', 'public-creator', at, at);
  bind.run('tournaments-manager', 'public-creator', at, at);
  bind.run('spin-and-go-manager', 'public-creator', at, at);
  bind.run('sit-and-go-manager', 'public-creator', at, at);
  const response = await server.get('/api/marketplace/contributors');
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.data), ['contributors']);
  assert.equal(response.data.contributors.length, 1);
  const creator = response.data.contributors[0];
  assert.deepEqual(Object.keys(creator).sort(), ['display_name', 'id', 'kind', 'products']);
  assert.equal(creator.display_name, 'DansiDanutz');
  assert.deepEqual(creator.products.map(p => p.id).sort(), ['cash-games-manager', 'spin-and-go-manager', 'tournaments-manager']);
  assert.deepEqual(Object.keys(creator.products[0]).sort(), ['id', 'name', 'slug']);
  assert.ok(!JSON.stringify(response.data).includes('private-'));
  db.prepare("UPDATE marketplace_publishers SET status='suspended' WHERE id='public-creator'").run();
  assert.deepEqual((await server.get('/api/marketplace/contributors')).data.contributors, []);
  assert.equal((await server.post('/api/marketplace/contributors', { body: {} })).status, 405);
});

test('published submissions appear without a paid offer, revoked submissions do not', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());
  const db = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'));
  t.after(() => db.close());
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  const at = new Date().toISOString();
  db.prepare(`INSERT INTO marketplace_publishers VALUES ('creator',?,'Creator','individual','secret','approved','secret',?,?)`).run(user.id, at, at);
  db.prepare(`INSERT INTO marketplace_products SELECT 'contrib-rake-lab','contrib-rake-lab','Rake Lab',summary,description,category,delivery,'available',pricing,price_cents,currency,features_json,featured,sort_order,created_at,updated_at FROM marketplace_products LIMIT 1`).run();
  db.prepare(`INSERT INTO contributor_submissions
    (id,user_id,publisher_id,plugin_id,pr_number,head_sha,notes,proof_json,status,created_at,updated_at)
    VALUES ('submission',?,'creator','rake-lab',224,'sha','private-notes','{}','published',?,?)`).run(user.id, at, at);
  const response = await server.get('/api/marketplace/contributors');
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.contributors[0].products, [{ id: 'contrib-rake-lab', name: 'Rake Lab', slug: 'contrib-rake-lab' }]);
  db.prepare("UPDATE contributor_submissions SET status='revoked'").run();
  assert.deepEqual((await server.get('/api/marketplace/contributors')).data.contributors[0].products, []);
});
