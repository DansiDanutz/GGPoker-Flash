// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

test('organizer rake is validated before charging, owner-only, paused/empty-only, persisted and broadcast', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  let db;
  const sockets = [];
  const post = async (route, token, body) => {
    const r = await srv.post(route, { token, body }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
  };
  try {
    const admin = await srv.login('admin', 'admin123');
    const owner = await post('/api/auth/register', null, { login: 'rake_owner', nick: 'RakeOwner', password: 'rake-test-password' });
    const stranger = await post('/api/auth/register', null, { login: 'rake_stranger', nick: 'Stranger', password: 'rake-test-password' });
    await post('/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 5000, reference: 'rake-test-credit' });
    await post('/api/marketplace/billing/subscribe', owner.token, { role: 'organizer', idempotencyKey: 'rake-membership' });
    const mine = async () => (await srv.get('/api/marketplace/billing/me', { token: owner.token })).data;
    const invalid = [
      { rakePercent: 1, rakeCap: 10 }, { rakePercent: 6, rakeCap: 10 }, { rakePercent: 2.5, rakeCap: 10 },
      { rakePercent: '3', rakeCap: 10 }, { rakePercent: null, rakeCap: 10 },
      ...[0, -1, 1.5, '100', null, 9000000001].map((rakeCap) => ({ rakePercent: 3, rakeCap })),
    ];
    for (const [i, settings] of invalid.entries()) {
      assert.equal((await srv.post('/api/tables/host', { token: owner.token, body: { game: 'holdem', idempotencyKey: `invalid-${i}`, ...settings } })).status, 400);
    }
    assert.equal((await mine()).balance_cents, 4100);
    assert.equal((await mine()).tables.length, 0);
    const cash = await post('/api/tables/host', owner.token, { name: 'Rake test', game: 'holdem', sb: 50, bb: 100, min_buyin: 5000, max_buyin: 10000, rakePercent: 3, rakeCap: 17, idempotencyKey: 'rake-create' });
    const route = `/api/marketplace/billing/cash/${cash.id}/rake`;
    const socket = srv.socket(owner.token); sockets.push(socket); await socket.opened;
    socket.send({ type: 'join_table', tableId: cash.id, observe: true });
    await socket.next((m) => m.type === 'state' && m.state.id === cash.id && m.state.rakePercent === 3 && m.state.rakeCap === 17);
    assert.equal((await srv.post(route, { token: stranger.token, body: { rakePercent: 2, rakeCap: 7 } })).status, 404);
    for (const body of [...invalid, { rakePercent: 3 }, { rakeCap: 10 }, { rakePercent: 3, rakeCap: 10, owner_id: stranger.user.id }]) {
      assert.equal((await srv.post(route, { token: owner.token, body })).status, 400);
    }
    for (const rakePercent of [2, 3, 4, 5]) {
      await post(route, owner.token, { rakePercent, rakeCap: rakePercent * 10 });
      const table = (await mine()).tables.find((t) => t.id === cash.id);
      assert.equal(table.rakePercent, rakePercent); assert.equal(table.rakeCap, rakePercent * 10);
      await socket.next((m) => m.type === 'state' && m.state.id === cash.id && m.state.rakePercent === rakePercent && m.state.rakeCap === rakePercent * 10);
    }
    assert.equal((await mine()).balance_cents, 3100, 'rake changes do not charge setup again');
    socket.send({ type: 'reserve_seat', tableId: cash.id, seat: 2 });
    await socket.nextType('seat_reserved');
    assert.equal((await srv.post(route, { token: owner.token, body: { rakePercent: 2, rakeCap: 7 } })).status, 409, 'a pending buy-in must see stable rake terms');
    socket.send({ type: 'cancel_reservation', tableId: cash.id });
    await socket.next((m) => m.type === 'state' && m.state.id === cash.id && m.state.players.every((p) => !p.reserved));
    await post(`/api/marketplace/billing/cash/${cash.id}/start`, owner.token, { idempotencyKey: 'rake-start' });
    assert.equal((await srv.post(route, { token: owner.token, body: { rakePercent: 2, rakeCap: 7 } })).status, 409);
    socket.send({ type: 'join_table', tableId: cash.id, seat: 0, buyin: 5000 });
    await socket.next((m) => m.type === 'joined' && m.tableId === cash.id && m.seat === 0);
    await post(`/api/marketplace/billing/cash/${cash.id}/stop`, owner.token, {});
    assert.equal((await srv.post(route, { token: owner.token, body: { rakePercent: 2, rakeCap: 7 } })).status, 409, 'paused but seated is not editable');
    socket.send({ type: 'leave_table', tableId: cash.id });
    // A message on this same socket confirms leave/cash-out has been processed.
    socket.send({ type: 'join_table', tableId: cash.id, observe: true });
    await socket.next((m) => m.type === 'joined' && m.tableId === cash.id && m.observe);
    await post(route, owner.token, { rakePercent: 2, rakeCap: 7 });
    await post(route, owner.token, { rakePercent: 2, rakeCap: 7 });
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    assert.deepEqual({ ...db.prepare('SELECT rake_percent,rake_cap FROM tables WHERE id=?').get(cash.id) }, { rake_percent: 2, rake_cap: 7 });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='organizer_cash_rake'").get().n, 5, 'retry creates no duplicate audit');
    db.prepare("INSERT INTO organizer_chip_sessions VALUES (?, 'recovered-seat', ?, ?, 0, 'open', datetime('now'), NULL)").run(owner.user.id, owner.user.id, cash.id);
    assert.equal((await srv.post(route, { token: owner.token, body: { rakePercent: 4, rakeCap: 20 } })).status, 409, 'durable open sessions also block edits');
  } finally {
    await Promise.all(sockets.map((socket) => socket.close()));
    db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
