// Admin users list: GET /api/admin/users search (q), status filter, limit/offset paging and publicUser safety.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import { parseLimit, parseOffset, parseUsersQuery, DEFAULT_LIMIT, MAX_LIMIT } from './admin-users-list.js';
import { usersQuery } from '../src/lib/api.ts';

const PUBLIC_USER_KEYS = [
  'avatar', 'balance', 'banned', 'chat_muted', 'country', 'created_at', 'elo', 'email', 'gems', 'id',
  'is_admin', 'login', 'nick', 'play_chips', 'tickets', 'vip_level', 'vip_points', 'xp',
].sort();
const BULK_USERS = 230;

let srv;
let adminToken;
let playerToken;
const ids = {};

async function register(login, nick, email = '') {
  const reg = await srv.post('/api/auth/register', { body: { login, nick, email, password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  return { token: reg.data.token, id: reg.data.user.id };
}

// Flags and bulk rows written straight into the server's database so every filter has a known answer.
function seedUsers(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('BEGIN IMMEDIATE');
    db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(ids.banned);
    db.prepare('UPDATE users SET chat_muted = 1 WHERE id = ?').run(ids.muted);
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(ids.staff);
    db.prepare("UPDATE users SET deleted_at = datetime('now'), banned = 1 WHERE id = ?").run(ids.gone);
    const insert = db.prepare("INSERT INTO users (login,nick,password,email) VALUES (?,?,'x',?)");
    insert.run('ul_100%_sure', 'Percent', '');
    for (let i = 0; i < BULK_USERS; i += 1) insert.run(`ulb_${String(i).padStart(3, '0')}`, `Bulk ${i}`, '');
    db.exec('COMMIT');
  } finally {
    db.close();
  }
}

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  playerToken = (await register('ul_player', 'Plain Player')).token;
  ids.email = (await register('ul_mailer', 'Mailer', 'zebra.only@example.test')).id;
  ids.nick = (await register('ul_nicky', 'Quokka Nick')).id;
  ids.login = (await register('ul_walrus_login', 'Someone')).id;
  ids.banned = (await register('ul_banned', 'Banned One')).id;
  ids.muted = (await register('ul_muted', 'Muted One')).id;
  ids.staff = (await register('ul_staff', 'Staff One')).id;
  ids.gone = (await register('ul_gone', 'Gone One')).id;
  seedUsers(srv.dataDir);
});
after(async () => { await srv.stop(); });

const list = (query = '', token = adminToken) => srv.get(`/api/admin/users${query}`, { token });
const loginsOf = (res) => res.data.users.map((u) => u.login);

test('parseLimit, parseOffset and parseUsersQuery validate input', () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit('abc'), DEFAULT_LIMIT);
  assert.equal(parseLimit('0'), DEFAULT_LIMIT);
  assert.equal(parseLimit('25'), 25);
  assert.equal(parseLimit('5000'), MAX_LIMIT);
  assert.equal(parseOffset(null), 0);
  assert.equal(parseOffset('-3'), 0);
  assert.equal(parseOffset('1.5'), 0);
  assert.equal(parseOffset('75'), 75);
  assert.deepEqual(parseUsersQuery(new URLSearchParams('q=%20Bob%20&status=muted&limit=10&offset=20')),
    { ok: true, filters: { q: 'Bob', status: 'muted', limit: 10, offset: 20 } });
  assert.deepEqual(parseUsersQuery(new URLSearchParams('')).filters, { q: '', status: 'all', limit: DEFAULT_LIMIT, offset: 0 });
  assert.equal(parseUsersQuery(new URLSearchParams('status=deleted')).ok, false);
  assert.equal(parseUsersQuery(new URLSearchParams(`q=${'x'.repeat(201)}`)).ok, false);
});

test('anonymous is 401 and a non-admin is 403', async () => {
  for (const query of ['', '?q=ul_', '?status=banned', '?limit=5&offset=5']) {
    assert.equal((await list(query, null)).status, 401, query);
    const player = await list(query, playerToken);
    assert.equal(player.status, 403, query);
    assert.equal(player.data.users, undefined, query);
  }
});

test('default response: first 50 users by id, total of every non-deleted user, applied filters', async () => {
  const res = await list();
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.filters, { q: '', status: 'all', limit: 50, offset: 0 });
  assert.equal(res.data.users.length, 50);
  const ids50 = res.data.users.map((u) => u.id);
  assert.deepEqual(ids50, [...ids50].sort((a, b) => a - b));
  assert.ok(res.data.total > BULK_USERS + 8, `total ${res.data.total}`);
  assert.ok(!loginsOf(res).includes('ul_gone'));
  assert.equal(typeof res.data.activeAdmins, 'number');
});

test('q matches login, nick and email case-insensitively; % and _ are literal', async () => {
  const byLogin = await list('?q=WALRUS');
  assert.deepEqual(loginsOf(byLogin), ['ul_walrus_login']);
  assert.equal(byLogin.data.total, 1);
  assert.deepEqual(loginsOf(await list('?q=quokka')), ['ul_nicky']);
  assert.deepEqual(loginsOf(await list('?q=ZEBRA.ONLY%40example')), ['ul_mailer']);
  assert.deepEqual(loginsOf(await list('?q=100%25')), ['ul_100%_sure']);
  assert.equal((await list('?q=ul%25gone')).data.total, 0, '% must not act as a wildcard');
  assert.equal((await list('?q=u_b_000')).data.total, 0, '_ must not act as a wildcard');
  const injection = await list(`?q=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(injection.status, 200);
  assert.equal(injection.data.total, 0);
  assert.equal((await list('?q=ul_gone')).data.total, 0, 'deleted accounts are never listed');
});

test('each status filter selects the right users and bad statuses are 400', async () => {
  const banned = await list('?status=banned&q=ul_');
  assert.deepEqual(loginsOf(banned), ['ul_banned']);
  const muted = await list('?status=muted&q=ul_');
  assert.deepEqual(loginsOf(muted), ['ul_muted']);
  const admins = await list('?status=admin');
  assert.deepEqual(loginsOf(admins).sort(), ['admin', 'ul_staff']);
  assert.ok(admins.data.users.every((u) => u.is_admin));
  const all = await list('?status=all&q=ul_banned');
  assert.deepEqual(loginsOf(all), ['ul_banned']);
  const active = await list('?status=active&q=ul_');
  assert.ok(!loginsOf(active).includes('ul_banned'));
  assert.ok(loginsOf(active).includes('ul_muted'), 'chat-muted players are still active');
  assert.ok(active.data.users.every((u) => !u.banned));
  assert.equal((await list('?status=nope')).status, 400);
});

test('active total counts every unbanned, non-deleted user across pages', async () => {
  const all = await list('?limit=1');
  const banned = await list('?status=banned&limit=1');
  const active = await list('?status=active&limit=1');
  assert.equal(active.data.users.length, 1);
  assert.equal(active.data.total, all.data.total - banned.data.total);
  assert.equal(active.data.total, (await list('?status=active&limit=200')).data.total);
  assert.equal(admins(await list('?status=admin&limit=200')), (await list()).data.activeAdmins);
});
const admins = (res) => res.data.users.filter((u) => u.is_admin && !u.banned).length;

test('limit is clamped to 200 and invalid values fall back to 50', async () => {
  const big = await list('?limit=5000');
  assert.equal(big.data.users.length, MAX_LIMIT);
  assert.equal(big.data.filters.limit, MAX_LIMIT);
  assert.equal((await list('?limit=abc')).data.users.length, DEFAULT_LIMIT);
  assert.equal((await list('?limit=-4')).data.filters.limit, DEFAULT_LIMIT);
  assert.equal((await list('?limit=7')).data.users.length, 7);
});

test('offset pages through matches without gaps or overlap, total stays constant', async () => {
  const pageSize = 100;
  const first = await list(`?q=ulb_&limit=${pageSize}`);
  assert.equal(first.data.total, BULK_USERS);
  const seen = [];
  for (let offset = 0; offset < BULK_USERS; offset += pageSize) {
    const page = await list(`?q=ulb_&limit=${pageSize}&offset=${offset}`);
    assert.equal(page.data.total, BULK_USERS);
    assert.equal(page.data.filters.offset, offset);
    seen.push(...loginsOf(page));
  }
  assert.equal(seen.length, BULK_USERS);
  assert.equal(new Set(seen).size, BULK_USERS);
  assert.deepEqual(seen, [...seen].sort());
  const last = await list(`?q=ulb_&limit=${pageSize}&offset=200`);
  assert.equal(last.data.users.length, BULK_USERS - 200);
  const past = await list(`?q=ulb_&limit=${pageSize}&offset=999`);
  assert.equal(past.data.users.length, 0);
  assert.equal(past.data.total, BULK_USERS);
  assert.equal((await list('?q=ulb_&offset=-1')).data.filters.offset, 0);
});

test('rows are publicUser only: no password hash, deleted_at or last_login', async () => {
  const res = await list('?limit=200');
  for (const u of res.data.users) {
    assert.deepEqual(Object.keys(u).sort(), PUBLIC_USER_KEYS, u.login);
    assert.equal(typeof u.is_admin, 'boolean');
    assert.equal(typeof u.banned, 'boolean');
    assert.equal(typeof u.chat_muted, 'boolean');
  }
  assert.ok(!JSON.stringify(res.data).includes('password'));
});

test('non-GET methods are 405 for admins', async () => {
  const res = await srv.post('/api/admin/users', { token: adminToken, body: {} });
  assert.equal(res.status, 405);
});

test('client usersQuery omits defaults and encodes values', () => {
  assert.equal(usersQuery({}), '');
  assert.equal(usersQuery({ q: '  ', status: 'all', limit: 0, offset: 0 }), '');
  assert.equal(usersQuery({ q: ' a&b ', status: 'banned', limit: 25, offset: 50 }), 'q=a%26b&status=banned&limit=25&offset=50');
});
