// Admin wait-list monitor (P0 slice W7): pure helpers + the /api/admin/waitlists routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as waitlist from './waitlist.js';
import { trackJoinTimes, summarizeQueues, clearQueue, parseClearTarget, groupName } from './admin-waitlist.js';
import { startServer, nextSseEvent, sleep } from './test-helpers.js';

/* ------------------------------ pure helpers ------------------------------ */

const ctx = (joinedAt, now) => ({ joinedAt, now, nickOf: (id) => `P${id}`, tableNameOf: (id) => `Table ${id}` });

test('summarizeQueues lists every non-empty queue with positions, held seats and the oldest wait', () => {
  let s = waitlist.createWaitlist();
  let since = {};
  const step = (next, now) => { since = trackJoinTimes(since, s, next, now); s = next; };
  step(waitlist.join(s, 1, { tableId: 'a' }).state, 1000);
  step(waitlist.join(s, 2, { tableId: 'a' }).state, 4000);
  step(waitlist.join(s, 3, { groupKey: 'holdem:1/2:6', tables: [] }).state, 5000);
  step(waitlist.offer(s, 'a', 0, 6000, { holdMs: 30_000 }).state, 6000); // P1 now holds seat 0

  const view = summarizeQueues(s, ctx(since, 10_000));
  assert.deepEqual(view.totals, { queues: 2, waiting: 2, held: 1 });
  const [group, table] = view.queues;
  assert.equal(group.queueKey, 'g:holdem:1/2:6');
  assert.equal(group.name, 'holdem 1/2 · 6-max');
  assert.deepEqual(group.positions, [{ userId: 3, nick: 'P3', position: 1, waitingMs: 5000 }]);
  assert.equal(table.name, 'Table a');
  assert.equal(table.length, 1);
  assert.deepEqual(table.positions, [{ userId: 2, nick: 'P2', position: 1, waitingMs: 6000 }]);
  assert.deepEqual(table.held, [{ userId: 1, nick: 'P1', tableId: 'a', tableName: 'Table a', seat: 0, deadline: 36_000, remainingMs: 26_000 }]);
  assert.equal(table.oldestWaitMs, 6000);
  assert.equal(since['t:a|1'], undefined, 'an offered player no longer counts as waiting');
});

test('trackJoinTimes keeps existing join times and returns a new object', () => {
  const s0 = waitlist.createWaitlist();
  const s1 = waitlist.join(s0, 1, { tableId: 'a' }).state;
  const t1 = trackJoinTimes({}, s0, s1, 100);
  const s2 = waitlist.join(s1, 2, { tableId: 'a' }).state;
  const t2 = trackJoinTimes(t1, s1, s2, 200);
  assert.deepEqual(t2, { 't:a|1': 100, 't:a|2': 200 });
  assert.deepEqual(t1, { 't:a|1': 100 }, 'input untouched');
});

test('clearQueue removes the queue and its offers without touching other queues', () => {
  let s = waitlist.createWaitlist();
  s = waitlist.join(s, 1, { tableId: 'a' }).state;
  s = waitlist.join(s, 2, { tableId: 'a' }).state;
  s = waitlist.join(s, 3, { tableId: 'b' }).state;
  s = waitlist.offer(s, 'a', 4, 0).state;
  const before = s;
  const res = clearQueue(s, 't:a');
  assert.deepEqual(res.removed, [2]);
  assert.deepEqual(res.released.map((o) => [o.userId, o.seat]), [[1, 4]]);
  assert.deepEqual(res.state.queues, { 't:b': [3] });
  assert.deepEqual(res.state.offers, []);
  assert.equal(before.offers.length, 1, 'input state untouched');
});

test('parseClearTarget accepts exactly one valid target', () => {
  assert.deepEqual(parseClearTarget({ tableId: 'nlh-1' }), { queueKey: 't:nlh-1' });
  assert.deepEqual(parseClearTarget({ groupKey: 'holdem:1/2:6' }), { queueKey: 'g:holdem:1/2:6' });
  assert.ok(parseClearTarget({}).error);
  assert.ok(parseClearTarget({ tableId: 'a', groupKey: 'holdem:1/2:6' }).error);
  assert.ok(parseClearTarget({ tableId: 'bad id' }).error);
  assert.ok(parseClearTarget({ groupKey: 'holdem:2/1:6' }).error);
  assert.equal(groupName('nonsense'), 'nonsense');
});

/* ------------------------------ HTTP routes ------------------------------ */

const register = async (srv, login) => {
  const res = await srv.post('/api/auth/register', { body: { login, nick: `Nick ${login}`, password: 'secret12' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { token: res.data.token, id: res.data.user.id };
};
const tableRoute = (id) => `/api/tables/${encodeURIComponent(id)}/waitlist`;
const groupRoute = (key) => `/api/lobby/groups/${encodeURIComponent(key)}/waitlist`;

test('admin wait-list routes: non-admins get 403', async () => {
  const srv = await startServer();
  try {
    const u = await register(srv, 'aw_plain');
    assert.equal((await srv.get('/api/admin/waitlists')).status, 401);
    assert.equal((await srv.get('/api/admin/waitlists', { token: u.token })).status, 403);
    assert.equal((await srv.post('/api/admin/waitlists/clear', { token: u.token, body: { tableId: 'nlh-bronze-01' } })).status, 403);
    const admin = await srv.login('admin', 'admin123');
    assert.deepEqual((await srv.get('/api/admin/waitlists', { token: admin })).data, { queues: [], totals: { queues: 0, waiting: 0, held: 0 } });
    assert.equal((await srv.post('/api/admin/waitlists/clear', { token: admin, body: {} })).status, 400);
    assert.equal((await srv.post('/api/admin/waitlists/clear', { token: admin, body: { tableId: 'nlh-bronze-01' } })).status, 404);
    assert.equal((await srv.del('/api/admin/waitlists', { token: admin })).status, 405);
  } finally {
    await srv.stop();
  }
});

test('admin wait-list routes: list counts and positions, clear releases held seats, audits and notifies', async () => {
  const srv = await startServer();
  const sockets = [];
  try {
    const admin = await srv.login('admin', 'admin123');
    const tableId = 'aw-heads-up';
    const groupKey = 'holdem:50/100:2';
    const created = await srv.post('/api/admin/tables', {
      token: admin,
      body: { id: tableId, name: 'AW Heads-Up', game: 'holdem', sb: 50, bb: 100, min_buyin: 2000, max_buyin: 4000, seats: 2, sort: 0 },
    });
    assert.equal(created.status, 200);
    const [a, b, c, d, e] = await Promise.all(['aw_a', 'aw_b', 'aw_c', 'aw_d', 'aw_e'].map((l) => register(srv, l)));

    // Two humans fill the heads-up table.
    for (const u of [a, b]) {
      const sock = srv.socket(u.token);
      sockets.push(sock);
      await sock.opened;
      sock.send({ type: 'join_table', tableId, buyin: 2000 });
      assert.notEqual((await sock.next((m) => m.type === 'joined' && m.tableId === tableId)).seat, null);
    }
    for (const u of [c, d]) assert.equal((await srv.post(tableRoute(tableId), { token: u.token })).data.status, 'queued');
    assert.equal((await srv.post(groupRoute(groupKey), { token: e.token })).data.status, 'queued');

    // List: both queues, counts and positions with nicks.
    let view = (await srv.get('/api/admin/waitlists', { token: admin })).data;
    assert.deepEqual(view.totals, { queues: 2, waiting: 3, held: 0 });
    const table = view.queues.find((q) => q.queueKey === `t:${tableId}`);
    assert.equal(table.name, 'AW Heads-Up');
    assert.equal(table.length, 2);
    assert.deepEqual(table.positions.map((p) => [p.nick, p.position]), [['Nick aw_c', 1], ['Nick aw_d', 2]]);
    assert.ok(table.oldestWaitMs >= table.positions[1].waitingMs);
    assert.equal(view.queues.find((q) => q.queueKey === `g:${groupKey}`).kind, 'group');

    // Clear the group queue: it disappears, the member is told position 0.
    const sseGroup = nextSseEvent(srv.base, e.token, (ev) => ev.type === 'waitlist_update' && ev.groupKey === groupKey);
    await sleep(150);
    const clearedGroup = await srv.post('/api/admin/waitlists/clear', { token: admin, body: { groupKey } });
    assert.deepEqual(clearedGroup.data, { ok: true, queueKey: `g:${groupKey}`, kind: 'group', groupKey, removed: 1, released: 0 });
    assert.equal((await sseGroup).position, 0);

    // A seat opens: aw_c now holds it.
    sockets[0].send({ type: 'leave_table', tableId });
    for (let i = 0; i < 40; i++) {
      view = (await srv.get('/api/admin/waitlists', { token: admin })).data;
      if (view.totals.held) break;
      await sleep(50);
    }
    assert.deepEqual(view.totals, { queues: 1, waiting: 1, held: 1 });
    assert.deepEqual(view.queues[0].held.map((h) => [h.nick, h.tableId]), [['Nick aw_c', tableId]]);
    assert.equal((await srv.get('/api/waitlists/me', { token: c.token })).data.offers.length, 1);

    // Clear the table queue: the waiting player and the seat holder are both notified.
    const sseWaiting = nextSseEvent(srv.base, d.token, (ev) => ev.type === 'waitlist_update' && ev.tableId === tableId);
    const sseHolder = nextSseEvent(srv.base, c.token, (ev) => ev.type === 'waitlist_expired');
    await sleep(150);
    const cleared = await srv.post('/api/admin/waitlists/clear', { token: admin, body: { tableId } });
    assert.deepEqual(cleared.data, { ok: true, queueKey: `t:${tableId}`, kind: 'table', tableId, removed: 1, released: 1 });
    assert.deepEqual(await sseWaiting, { type: 'waitlist_update', queueKey: `t:${tableId}`, kind: 'table', tableId, position: 0, size: 0 });
    const expired = await sseHolder;
    assert.equal(expired.tableId, tableId);
    assert.equal(expired.reason, 'cleared');

    // Held seat released, queue gone.
    assert.deepEqual((await srv.get('/api/admin/waitlists', { token: admin })).data.totals, { queues: 0, waiting: 0, held: 0 });
    assert.deepEqual((await srv.get('/api/waitlists/me', { token: c.token })).data, { queues: [], offers: [] });
    assert.equal((await srv.post('/api/admin/waitlists/clear', { token: admin, body: { tableId } })).status, 404);

    // Audit rows written for both clears.
    const log = (await srv.get('/api/admin/audit', { token: admin })).data.log.filter((r) => r.action === 'waitlist_clear');
    assert.equal(log.length, 2);
    assert.equal(log[0].actor, 'admin');
    assert.match(log[0].detail, new RegExp(`^t:${tableId} · 1 waiting · 1 held released$`));
    assert.match(log[1].detail, /^g:holdem:50\/100:2 · 1 waiting · 0 held released$/);
  } finally {
    await Promise.all(sockets.map((s) => s.close()));
    await srv.stop();
  }
});
