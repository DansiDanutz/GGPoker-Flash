// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer, seatHumans } from './test-helpers.js';

test('free Play Money hosting works under paid enforcement without spending or creating Cash Chips', async (t) => {
  const srv = await startServer({ env: { GGPOKER_BIND: '127.0.0.1', GGPOKER_MARKETPLACE_ENFORCEMENT: 'enforce', GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  t.after(async () => { await srv.stop(); await rm(srv.dataDir, { recursive: true, force: true }); });
  const users = [];
  for (const login of ['sandbox_alice', 'sandbox_bob']) {
    const result = await srv.post('/api/auth/register', { body: { login, nick: login, password: 'sandbox-password' } });
    assert.equal(result.status, 200); users.push(result.data);
  }
  const token = users[0].token;
  const tableBody = { name: 'Free Play Money', economy: 'play_money', game: 'holdem', seats: 2, sb: 50, bb: 100, min_buyin: 5000, max_buyin: 5000, rakePercent: 3, rakeCap: 100 };
  const created = await srv.post('/api/tables/host', { token, body: tableBody });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const id = created.data.id;
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  t.after(() => db.close());
  const row = db.prepare('SELECT * FROM tables WHERE id=?').get(id);
  assert.equal(row.play_money, 1); assert.equal(row.chip_economy, 0); assert.equal(row.rake_percent, 3);
  for (const route of [`/api/marketplace/billing/cash/${id}/start`, `/api/marketplace/billing/cash/${id}/rake`]) {
    const result = await srv.post(route, { token, body: route.endsWith('rake') ? { rakePercent: 5, rakeCap: 300 } : { idempotencyKey: 'cannot-bill-free' } });
    assert.equal(result.status, 409, JSON.stringify(result.data));
  }
  assert.equal((await srv.post('/api/tables/host', { token, body: { ...tableBody, economy: 'organizer' } })).status, 402);
  assert.equal((await srv.post('/api/tables/host', { token, body: { ...tableBody, economy: 'invalid' } })).status, 400);
  const spin = await srv.post('/api/tables/host', { token, body: { economy: 'play_money', game: 'spingold', stake: 5000 } });
  assert.equal(spin.status, 200, JSON.stringify(spin.data));
  const tournament = await srv.post('/api/tournaments/host', { token, body: { economy: 'play_money', name: 'Free tournament', buyin: 1000, start_at: new Date(Date.now() + 3600000).toISOString() } });
  assert.equal(tournament.status, 200, JSON.stringify(tournament.data));
  assert.equal(db.prepare('SELECT chip_economy FROM tournaments WHERE id=?').get(tournament.data.id).chip_economy, 0);
  const sockets = users.map((user) => srv.socket(user.token));
  t.after(async () => { for (const socket of sockets) if (socket.ws.readyState < 2) await socket.close(); });
  await Promise.all(sockets.map((socket) => socket.opened));
  await seatHumans(sockets, id, 5000);
  const state = await sockets[0].next((message) => message.type === 'state' && message.state?.players?.filter((p) => p.inHand).length === 2);
  assert.ok(state.state.players.some((player) => player.id === users[0].user.id));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM organizer_billing_ledger').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM organizer_chip_journals').get().n, 0);
  const billing = await srv.get('/api/marketplace/billing/me', { token });
  assert.equal(billing.data.balance_cents, 0); assert.equal(billing.data.tables.length, 0); assert.equal(billing.data.tournaments.length, 0);
  for (const route of ['/api/marketplace/contributor', '/api/admin/marketplace/contributor']) assert.equal((await srv.get(route)).status, 401);
  assert.equal((await srv.get('/api/admin/marketplace/contributor', { token })).status, 403);
  assert.equal((await srv.post('/api/marketplace/contributor', { token, body: { pluginId: 'test-plugin', prUrl: 'https://github.com/OpenPoker4all/OpenPoker/pull/1', notes: 'Local tests passed.' } })).status, 402);
  assert.deepEqual((await srv.get('/api/marketplace/contributor/plugins')).data.plugins, []);
});
