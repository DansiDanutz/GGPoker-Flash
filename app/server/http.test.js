import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer as startTestServer, nextSseEvent, sleep } from './test-helpers.js';

const root = path.resolve(import.meta.dirname, '..');

function startServer() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-http-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', GGPOKER_DATA: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 15000);
    child.stdout.on('data', (d) => {
      out += String(d);
      const m = out.match(/LISTENING (\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]), data }); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
  });
}

test('server binds an ephemeral port and serves the API', async () => {
  const { child, port, data } = await startServer();
  try {
    const lobby = await fetch(`http://127.0.0.1:${port}/api/lobby`).then((r) => r.json());
    assert.ok(Array.isArray(lobby.tables));
    assert.equal(lobby.tables[0].synthetic, true);
    // The login screen only offers the demo shortcut when this account exists.
    assert.equal(lobby.demoAccount, true);
    const badOrigin = await fetch(`http://127.0.0.1:${port}/api/lobby`, { headers: { origin: 'http://evil.example' } });
    assert.equal(badOrigin.status, 403);
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
    }).then((r) => r.json());
    assert.ok(login.token);
    const deposit = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ amount: 1000, method: 'card' }),
    }).then((r) => r.json());
    assert.equal(deposit.ok, true);
    const first = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
      body: JSON.stringify({ amount: 700, method: 'card' }),
    }).then((r) => r.json());
    const second = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
      body: JSON.stringify({ amount: 700, method: 'card' }),
    }).then((r) => r.json());
    assert.equal(first.balance, second.balance);
    assert.equal(second.replayed, true);
    const conflict = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
      body: JSON.stringify({ amount: 800, method: 'card' }),
    });
    assert.equal(conflict.status, 409);
    const w1 = await fetch(`http://127.0.0.1:${port}/api/cashier/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'wd-1' },
      body: JSON.stringify({ amount: 100, method: 'bank' }),
    }).then((r) => r.json());
    const w2 = await fetch(`http://127.0.0.1:${port}/api/cashier/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'wd-1' },
      body: JSON.stringify({ amount: 100, method: 'bank' }),
    }).then((r) => r.json());
    assert.equal(w1.balance, w2.balance);
    assert.equal(w2.replayed, true);
    const reg = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'freshuser', nick: 'Fresh', password: 'fresh123' }),
    }).then((r) => r.json());
    assert.equal(reg.user.balance, 600000);
    const regCash = await fetch(`http://127.0.0.1:${port}/api/cashier`, {
      headers: { authorization: `Bearer ${reg.token}` },
    }).then((r) => r.json());
    assert.equal(regCash.user.balance, 600000);
    assert.equal(regCash.transactions.find((t) => t.kind === 'welcome')?.amount, 600000);
    const bad = await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ action: 'credit', amount: 1 }),
    });
    assert.equal(bad.status, 403);
    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    }).then((r) => r.json());
    const del = await fetch(`http://127.0.0.1:${port}/api/admin/users/3`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ action: 'delete' }),
    }).then((r) => r.json());
    assert.equal(del.ok, true);
    const guest = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'guest', password: 'guest' }),
    });
    assert.equal(guest.status, 400);
    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
    const deleted = db.prepare('SELECT deleted_at, login FROM users WHERE id = 3').get();
    assert.ok(deleted.deleted_at);
    assert.ok(deleted.login.startsWith('deleted:3:'));
  } finally {
    child.kill();
  }
});


test('live join and leave write matching session markers', async () => {
  const { child, port, data } = await startServer();
  try {
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
    }).then((r) => r.json());
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${login.token}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ type: 'join_table', tableId: 'nlh-diamond-01', buyin: 50000 }));
    await new Promise((r) => setTimeout(r, 1800));
    ws.send(JSON.stringify({ type: 'leave_table', tableId: 'nlh-diamond-01' }));
    await new Promise((r) => setTimeout(r, 600));
    ws.close();
    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
    const rows = db.prepare("SELECT kind, amount, session_id, reference FROM transactions WHERE session_id IS NOT NULL ORDER BY id").all();
    assert.equal(rows[0].kind, 'buyin');
    assert.ok(rows[0].reference.startsWith('in:'));
    const close = rows.find((r) => r.reference.startsWith('out:'));
    assert.ok(close);
    assert.equal(close.session_id, rows[0].session_id);
    assert.equal(close.reference, `out:${rows[0].session_id}`);
  } finally {
    child.kill();
  }
});


test('deleting a user closes the live socket and blocks a rejoin', async () => {
  const { child, port, data } = await startServer();
  try {
    const user = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
    }).then((r) => r.json());
    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    }).then((r) => r.json());
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${user.token}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ type: 'join_table', tableId: 'nlh-diamond-01', buyin: 50000 }));
    await new Promise((r) => setTimeout(r, 1200));
    const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ action: 'delete' }),
    });
    assert.equal(await closed, 4001);
    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
    const second = db.prepare("SELECT COUNT(*) c FROM transactions WHERE session_id LIKE 'nlh-diamond-02:%'").get().c;
    assert.equal(second, 0);
  } finally {
    child.kill();
  }
});


/* ------------------------------ wait-list API (P0 slice W3) ------------------------------ */

const register = async (srv, login) => {
  const res = await srv.post('/api/auth/register', { body: { login, nick: login, password: 'secret12' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { token: res.data.token, id: res.data.user.id };
};
const tableRoute = (id) => `/api/tables/${encodeURIComponent(id)}/waitlist`;
const groupRoute = (key) => `/api/lobby/groups/${encodeURIComponent(key)}/waitlist`;

test('wait-list API: auth required, bad input rejected, unknown targets 404, rate limited', async () => {
  const srv = await startTestServer();
  try {
    for (const [method, route] of [['post', tableRoute('nlh-bronze-01')], ['del', tableRoute('nlh-bronze-01')],
      ['post', groupRoute('holdem:100/200:6')], ['del', groupRoute('holdem:100/200:6')], ['get', '/api/waitlists/me']]) {
      assert.equal((await srv[method](route)).status, 401, `${method} ${route}`);
    }
    const u = await register(srv, 'wl_basic');
    assert.equal((await srv.post(tableRoute('no-such-table'), { token: u.token })).status, 404);
    assert.equal((await srv.del(tableRoute('no-such-table'), { token: u.token })).status, 404);
    assert.equal((await srv.post('/api/tables/bad%20id/waitlist', { token: u.token })).status, 400);
    assert.equal((await srv.post(groupRoute('holdem:200/100:6'), { token: u.token })).status, 400);
    assert.equal((await srv.post(groupRoute('holdem:7/14:2'), { token: u.token })).status, 404);
    assert.equal((await srv.get(tableRoute('nlh-bronze-01'), { token: u.token })).status, 405);
    const me = await srv.get('/api/waitlists/me', { token: u.token });
    assert.deepEqual(me.data, { queues: [], offers: [] });

    // A table with room answers 'seat' instead of queueing.
    const spammer = await register(srv, 'wl_spammer');
    const first = await srv.post(tableRoute('nlh-bronze-01'), { token: spammer.token });
    assert.deepEqual(first.data, { status: 'seat', tableId: 'nlh-bronze-01' });
    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await srv.post(tableRoute('nlh-bronze-01'), { token: spammer.token })).status);
    assert.deepEqual(statuses.slice(0, 9), Array(9).fill(200));
    assert.equal(statuses[9], 429);
    // The limit is per player.
    assert.equal((await srv.post(tableRoute('nlh-bronze-01'), { token: u.token })).status, 200);
  } finally {
    await srv.stop();
  }
});

test('wait-list API: a full table queues, lobby shows the real wait and myWait, SSE tracks the queue', async () => {
  const srv = await startTestServer();
  const sockets = [];
  try {
    const admin = await srv.login('admin', 'admin123');
    const tableId = 'wl-heads-up';
    const created = await srv.post('/api/admin/tables', {
      token: admin,
      body: { id: tableId, name: 'WL Heads-Up', game: 'holdem', sb: 50, bb: 100, min_buyin: 2000, max_buyin: 4000, seats: 2, sort: 0 },
    });
    assert.equal(created.status, 200);
    const [a, b, c] = [await register(srv, 'wl_a'), await register(srv, 'wl_b'), await register(srv, 'wl_c')];

    // Two humans fill the heads-up table (the second replaces the bot).
    for (const u of [a, b]) {
      const sock = srv.socket(u.token);
      sockets.push(sock);
      await sock.opened;
      sock.send({ type: 'join_table', tableId, buyin: 2000 });
      assert.notEqual((await sock.next((m) => m.type === 'joined' && m.tableId === tableId)).seat, null);
    }
    assert.equal((await srv.post(tableRoute(tableId), { token: a.token })).status, 409, 'seated players cannot queue');

    const sseJoin = nextSseEvent(srv.base, c.token, (e) => e.type === 'waitlist_update' && e.tableId === tableId);
    await sleep(150); // let the stream register
    const queued = await srv.post(tableRoute(tableId), { token: c.token });
    assert.equal(queued.status, 200);
    assert.deepEqual(queued.data, { status: 'queued', position: 1, size: 1, queueKey: `t:${tableId}`, kind: 'table', tableId });
    assert.deepEqual(await sseJoin, { type: 'waitlist_update', queueKey: `t:${tableId}`, kind: 'table', tableId, position: 1, size: 1 });
    const again = await srv.post(tableRoute(tableId), { token: c.token });
    assert.equal(again.data.position, 1, 'a duplicate join keeps the existing position');

    const rowFor = async (token) => (await srv.get('/api/lobby', { token })).data.tables.find((t) => t.id === tableId);
    assert.deepEqual([(await rowFor(c.token)).wait, (await rowFor(c.token)).myWait], [1, 1]);
    assert.deepEqual([(await rowFor(a.token)).wait, (await rowFor(a.token)).myWait], [1, 0]);
    const anonymous = (await srv.get('/api/lobby')).data.tables;
    assert.equal(anonymous.find((t) => t.id === tableId).myWait, 0);
    assert.ok(anonymous.filter((t) => t.id !== tableId).every((t) => t.wait === 0), 'no synthetic hash-based waits remain');

    // The group of the full table queues too; /me lists both queues.
    const groupKey = 'holdem:50/100:2';
    const group = await srv.post(groupRoute(groupKey), { token: c.token });
    assert.deepEqual(group.data, { status: 'queued', position: 1, size: 1, queueKey: `g:${groupKey}`, kind: 'group', groupKey });
    const me = (await srv.get('/api/waitlists/me', { token: c.token })).data;
    assert.deepEqual(me.queues, [
      { queueKey: `g:${groupKey}`, position: 1, size: 1, kind: 'group', groupKey },
      { queueKey: `t:${tableId}`, position: 1, size: 1, kind: 'table', tableId, tableName: 'WL Heads-Up' },
    ]);
    assert.deepEqual(me.offers, []);

    // Leaving clears the queue, the lobby count and tells the player over SSE.
    const sseLeave = nextSseEvent(srv.base, c.token, (e) => e.type === 'waitlist_update' && e.tableId === tableId && e.position === 0);
    await sleep(150);
    assert.deepEqual((await srv.del(tableRoute(tableId), { token: c.token })).data, { ok: true, left: true });
    assert.equal((await sseLeave).size, 0);
    assert.deepEqual([(await rowFor(c.token)).wait, (await rowFor(c.token)).myWait], [0, 0]);
    assert.deepEqual((await srv.del(tableRoute(tableId), { token: c.token })).data, { ok: true, left: false });
    assert.deepEqual((await srv.del(groupRoute(groupKey), { token: c.token })).data, { ok: true, left: true });
  } finally {
    await Promise.all(sockets.map((s) => s.close()));
    await srv.stop();
  }
});

test('wait-list API: private tables answer only to the owner and invitees', async () => {
  const srv = await startTestServer();
  const sockets = [];
  try {
    const owner = await register(srv, 'wl_owner');
    const guest = await register(srv, 'wl_guest');
    const hosted = await srv.post('/api/tables/host', { token: owner.token, body: { name: 'Home game', seats: 2, sb: 50, bb: 100 } });
    assert.equal(hosted.status, 200);
    const id = hosted.data.id;

    assert.equal((await srv.post(tableRoute(id), { token: guest.token })).status, 404, 'uninvited players cannot see it');
    assert.equal((await srv.del(tableRoute(id), { token: guest.token })).status, 404);
    assert.equal((await srv.post(tableRoute(id), { token: owner.token })).data.status, 'seat');

    // Opening the invite link (watching the live table) makes the guest an invitee.
    const sock = srv.socket(guest.token);
    sockets.push(sock);
    await sock.opened;
    sock.send({ type: 'join_table', tableId: id, observe: true });
    await sock.next((m) => m.type === 'joined' && m.tableId === id);
    const invited = await srv.post(tableRoute(id), { token: guest.token });
    assert.equal(invited.status, 200);
    assert.equal(invited.data.status, 'seat');
    // Private tables never join a public lobby group.
    assert.equal((await srv.post(groupRoute('holdem:50/100:2'), { token: guest.token })).status, 404);
  } finally {
    await Promise.all(sockets.map((s) => s.close()));
    await srv.stop();
  }
});

/* ------------------------------ Rush pool lobby (P0 slice R3) ------------------------------ */

test('lobby rushPools: one row per pool, players summed, PLO pools separate, stakes descending', async () => {
  const srv = await startTestServer();
  try {
    const { status, data } = await srv.get('/api/lobby');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.tables) && data.tables.length, 'the table payload is kept');
    const pools = data.rushPools;
    const rushTables = data.tables.filter((t) => t.game === 'rush' || t.game === 'rushplo');
    const keys = new Set(rushTables.map((t) => `${t.game}:${t.sb}/${t.bb}`));
    assert.equal(pools.length, keys.size);
    assert.ok(pools.length >= 7, `at least 7 pools seeded, got ${pools.length}`);
    for (const pool of pools) {
      const members = rushTables.filter((t) => t.game === pool.game && t.sb === pool.sb && t.bb === pool.bb);
      assert.equal(pool.poolKey, `${pool.game}:${pool.sb}/${pool.bb}`);
      assert.equal(pool.tables, members.length);
      assert.equal(pool.players, members.reduce((n, t) => n + t.players, 0), `${pool.poolKey} sums players`);
      assert.equal(pool.wait, members.reduce((n, t) => n + t.wait, 0));
      assert.equal(pool.pros, 0);
      assert.equal(pool.handsPerHour, 0, 'no hands played yet on a fresh server');
      assert.equal(pool.groupKey, `${pool.game}:${pool.sb}/${pool.bb}:${pool.seats}`);
      const free = members.find((t) => t.players < t.seats);
      assert.equal(pool.firstFree, free ? free.id : null);
    }
    // Hold'em and PLO at the same stake stay separate pools.
    const at500 = pools.filter((p) => p.bb === 1000);
    assert.deepEqual(at500.map((p) => p.game), ['rush', 'rushplo']);
    for (let i = 1; i < pools.length; i++) {
      const [a, b] = [pools[i - 1], pools[i]];
      assert.ok(a.bb > b.bb || (a.bb === b.bb && a.sb >= b.sb), `${a.poolKey} before ${b.poolKey}`);
    }
    assert.deepEqual(data.rushLeaderboard, [], 'empty leaderboard on a fresh server');
  } finally {
    await srv.stop();
  }
});

test('lobby rushLeaderboard: today\'s Cash Drops and Rush pot wins per real player, play money', async () => {
  const srv = await startTestServer();
  try {
    const alice = await register(srv, 'rush_alice');
    const bob = await register(srv, 'rush_bob');
    const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    try {
      const credit = db.prepare(`INSERT INTO transactions (user_id,kind,amount,balance_after,memo,reference,created_at)
        VALUES (?,?,?,?,?,?,?)`);
      credit.run(alice.id, 'cashdrop', 5000, 0, 'drop', 'cashdrop:h1', new Date().toISOString().replace('T', ' ').slice(0, 19));
      credit.run(bob.id, 'cashdrop', 9000, 0, 'old drop', 'cashdrop:h0', '2000-01-01 00:00:00');
      const hand = db.prepare(`INSERT INTO hands (hand_no,table_id,table_name,game,players,board,pot,result)
        VALUES (1,?,?,?,'[]','',?,?)`);
      hand.run('rush-platinum-1', 'Rush', 'rush', 3000, JSON.stringify({ winners: [{ id: bob.id, nick: 'rush_bob', amount: 3000 }, { id: 'bot-x', nick: 'Bot', amount: 99999 }] }));
      hand.run('rush-platinum-1', 'Rush', 'rush', 4000, JSON.stringify({ winners: [{ id: alice.id, nick: 'rush_alice', amount: 4000 }] }));
      hand.run('nlh-diamond-01', 'Cash', 'holdem', 70000, JSON.stringify({ winners: [{ id: bob.id, nick: 'rush_bob', amount: 70000 }] }));
    } finally {
      db.close();
    }
    const { data } = await srv.get('/api/lobby');
    assert.deepEqual(data.rushLeaderboard.map(({ rank, nick, won }) => ({ rank, nick, won })), [
      { rank: 1, nick: 'rush_alice', won: 9000 },
      { rank: 2, nick: 'rush_bob', won: 3000 },
    ], 'bots, yesterday\'s drops and non-Rush hands are excluded');
    const platinum = data.rushPools.find((p) => p.poolKey === 'rush:500/1000');
    assert.equal(platinum.handsPerHour, 2, 'hands in the last hour count toward the pool');
  } finally {
    await srv.stop();
  }
});

/* ------------------------------ cross-room leaderboard metrics ------------------------------ */

test('leaderboard: vip/elo/xp ordering, nick tie-break, default vip, banned/deleted excluded, me rank', async () => {
  const srv = await startTestServer();
  try {
    const nicks = ['lb_a', 'lb_b', 'lb_c', 'lb_banned', 'lb_gone'];
    const users = {};
    for (const n of nicks) users[n] = await register(srv, n);
    const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    try {
      const set = db.prepare('UPDATE users SET vip_points = ?, elo = ?, xp = ? WHERE id = ?');
      set.run(900000003, 9002, 900000007, users.lb_a.id);
      set.run(900000002, 9001, 900000009, users.lb_b.id);
      set.run(900000002, 9003, 900000008, users.lb_c.id); // ties lb_b on VIP points: nick decides
      set.run(999999999, 9999, 999999999, users.lb_banned.id);
      set.run(999999998, 9998, 999999998, users.lb_gone.id);
      db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(users.lb_banned.id);
      db.prepare("UPDATE users SET deleted_at = datetime('now') WHERE id = ?").run(users.lb_gone.id);
    } finally {
      db.close();
    }
    const top3 = (data) => data.leaders.slice(0, 3).map(({ rank, nick, value }) => ({ rank, nick, value }));

    const vip = await srv.get('/api/leaderboard?metric=vip', { token: users.lb_c.token });
    assert.equal(vip.status, 200);
    assert.equal(vip.data.metric, 'vip');
    assert.deepEqual(top3(vip.data), [
      { rank: 1, nick: 'lb_a', value: 900000003 },
      { rank: 2, nick: 'lb_b', value: 900000002 },
      { rank: 3, nick: 'lb_c', value: 900000002 },
    ]);
    assert.deepEqual(vip.data.me, { rank: 3, value: 900000002 });
    const first = vip.data.leaders[0];
    assert.equal(first.vip_points, 900000003, 'old vip_points field kept');
    assert.equal(first.xp, 900000007, 'old xp field kept');
    for (const key of ['avatar', 'vip_level']) assert.ok(key in first, `${key} present`);
    assert.ok(vip.data.leaders.length <= 50);

    const byDefault = await srv.get('/api/leaderboard');
    assert.equal(byDefault.data.metric, 'vip', 'vip is the default metric');
    assert.deepEqual(top3(byDefault.data), top3(vip.data));
    assert.equal(byDefault.data.me, null, 'anonymous callers get no me');

    const elo = await srv.get('/api/leaderboard?metric=elo', { token: users.lb_a.token });
    assert.deepEqual(top3(elo.data), [
      { rank: 1, nick: 'lb_c', value: 9003 },
      { rank: 2, nick: 'lb_a', value: 9002 },
      { rank: 3, nick: 'lb_b', value: 9001 },
    ]);
    assert.deepEqual(elo.data.me, { rank: 2, value: 9002 });

    const xp = await srv.get('/api/leaderboard?metric=xp', { token: users.lb_a.token });
    assert.deepEqual(top3(xp.data), [
      { rank: 1, nick: 'lb_b', value: 900000009 },
      { rank: 2, nick: 'lb_c', value: 900000008 },
      { rank: 3, nick: 'lb_a', value: 900000007 },
    ]);
    assert.deepEqual(xp.data.me, { rank: 3, value: 900000007 });

    for (const data of [vip.data, elo.data, xp.data]) {
      const listed = data.leaders.map((l) => l.nick);
      assert.ok(!listed.includes('lb_banned') && !listed.includes('lb_gone'), 'banned and deleted users excluded');
    }
    const asBanned = await srv.get('/api/leaderboard?metric=xp', { token: users.lb_banned.token });
    assert.equal(asBanned.data.me, null, 'a banned caller has no rank');

    const bad = await srv.get('/api/leaderboard?metric=chips');
    assert.equal(bad.status, 400);
  } finally {
    await srv.stop();
  }
});

test('leaderboard: me rank is counted over all active players, not only the listed rows', async () => {
  const srv = await startTestServer();
  try {
    const me = await register(srv, 'lb_low');
    const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    let expected;
    try {
      db.prepare('UPDATE users SET xp = -1 WHERE id = ?').run(me.id);
      expected = db.prepare('SELECT COUNT(*) AS n FROM users WHERE banned = 0 AND deleted_at IS NULL').get().n;
    } finally {
      db.close();
    }
    const { data } = await srv.get('/api/leaderboard?metric=xp', { token: me.token });
    assert.deepEqual(data.me, { rank: Number(expected), value: -1 }, 'lowest XP ranks last among active players');
  } finally {
    await srv.stop();
  }
});

test('version endpoint reports the build identity', async () => {
  const { child, port } = await startServer();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/version`, { cache: 'no-store' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const info = await res.json();
    assert.equal(typeof info.version, 'string');
    assert.ok(info.version.length > 0);
    assert.equal(typeof info.build, 'string');
    assert.ok(info.build.length > 0);
  } finally {
    child.kill();
  }
});

test('admin platform endpoint reports process, sockets and storage', async () => {
  const { child, port } = await startServer();
  try {
    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    }).then((r) => r.json());
    assert.ok(admin.token, 'seeded admin can log in');

    const anon = await fetch(`http://127.0.0.1:${port}/api/admin/platform`);
    assert.ok([401, 403].includes(anon.status), 'platform report is admin-only');

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/platform`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(res.status, 200);
    const report = await res.json();
    assert.equal(report.ok, true);
    assert.equal(typeof report.server.node, 'string');
    assert.equal(typeof report.server.uptimeSec, 'number');
    assert.equal(report.sockets.total, 0);
    assert.equal(report.tables.live, 0);
    assert.equal(report.tournaments.rooms, 0);
    assert.equal(typeof report.db.users, 'number');
    assert.ok(report.db.sizeBytes > 0, 'the SQLite file is measured');

    const live = await fetch(`http://127.0.0.1:${port}/api/admin/tournaments/live`, {
      headers: { authorization: `Bearer ${admin.token}` },
    }).then((r) => r.json());
    assert.equal(live.ok, true);
    assert.deepEqual(live.tournaments.items, []);
  } finally {
    child.kill();
  }
});
