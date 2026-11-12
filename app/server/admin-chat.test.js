// Admin chat moderation: GET /api/admin/chat and POST /api/admin/chat/:id/delete.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sleep } from './test-helpers.js';
import { parseLimit, DEFAULT_LIMIT, MAX_LIMIT } from './admin-chat.js';

let srv;
let admin;
let alice;
let bob;
let carol;

const register = async (login, nick) => {
  const res = await srv.post('/api/auth/register', { body: { login, nick, password: 'secret12' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { token: res.data.token, id: res.data.user.id, nick };
};

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  alice = await register('ac_alice', 'Mod Alice');
  bob = await register('ac_bob', 'Mod Bob');
  carol = await register('ac_carol', 'Mod Carol');
  await seedChat();
});
after(async () => { await srv.stop(); });

async function hostTable(name) {
  const res = await srv.post('/api/tables/host', {
    token: alice.token,
    body: { name, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, seats: 6 },
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.id;
}

async function sit(token, tableId) {
  const ws = srv.socket(token);
  await ws.opened;
  ws.send({ type: 'join_table', tableId, buyin: 4000 });
  const joined = await ws.next((m) => m.type === 'joined' || m.type === 'error');
  assert.equal(joined.type, 'joined', JSON.stringify(joined));
  await ws.nextType('chat_history');
  return ws;
}

const chatEvent = (text) => (m) => m.type === 'event' && m.event.type === 'chat' && m.event.message === text;
async function say(ws, tableId, text) {
  ws.send({ type: 'chat', tableId, message: text });
  await ws.next(chatEvent(text));
}

const listChat = (query = '', token = admin) => srv.get(`/api/admin/chat${query}`, { token });
const deleteLine = (id, token = admin) => srv.post(`/api/admin/chat/${id}/delete`, { token });

// Two tables with chat, built once: A has Alice + Bob, B has Carol.
let tableA;
let tableB;
async function seedChat() {
  tableA = await hostTable('Moderation A');
  tableB = await hostTable('Moderation B');
  const a1 = await sit(alice.token, tableA);
  const a2 = await sit(bob.token, tableA);
  const b1 = await sit(carol.token, tableB);
  await say(a1, tableA, 'alice on A');
  await say(a2, tableA, 'bob on A');
  await say(b1, tableB, 'carol on B');
  await Promise.all([a1.close(), a2.close(), b1.close()]);
  // A lobby announcement must never appear in the table moderation feed.
  assert.equal((await srv.post('/api/admin/chat', { token: admin, body: { message: 'lobby notice' } })).status, 200);
}

test('parseLimit defaults, clamps and rejects junk', () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit('abc'), DEFAULT_LIMIT);
  assert.equal(parseLimit('0'), DEFAULT_LIMIT);
  assert.equal(parseLimit('2.5'), DEFAULT_LIMIT);
  assert.equal(parseLimit('5'), 5);
  assert.equal(parseLimit('99999'), MAX_LIMIT);
});

test('anonymous gets 401 and a non-admin gets 403 on list and delete', async () => {
  assert.equal((await listChat('', null)).status, 401);
  assert.equal((await deleteLine(1, null)).status, 401);
  assert.equal((await listChat('', bob.token)).status, 403);
  const line = (await listChat()).data.messages[0];
  assert.equal((await deleteLine(line.id, bob.token)).status, 403);
  assert.ok((await listChat()).data.messages.some((m) => m.id === line.id), 'a refused delete leaves the line');
});

test('list returns recent table lines with nicks and the tables that have chat', async () => {
  const res = await listChat();
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const texts = res.data.messages.map((m) => m.text);
  assert.deepEqual(texts, ['carol on B', 'bob on A', 'alice on A'], 'newest first, table channels only');
  const bobLine = res.data.messages.find((m) => m.text === 'bob on A');
  assert.equal(bobLine.nick, 'Mod Bob');
  assert.equal(bobLine.user_id, bob.id);
  assert.equal(bobLine.channel, `table:${tableA}`);
  assert.ok(bobLine.id > 0 && bobLine.created_at, 'id and created_at are present');
  assert.ok(!texts.includes('lobby notice'), 'lobby announcements are not table chat');

  const tables = Object.fromEntries(res.data.tables.map((t) => [t.tableId, t]));
  assert.deepEqual(Object.keys(tables).sort(), [tableA, tableB].sort());
  assert.equal(tables[tableA].name, 'Moderation A');
  assert.equal(tables[tableA].count, 2);
  assert.equal(tables[tableB].count, 1);

  const limited = await listChat('?limit=1');
  assert.deepEqual(limited.data.messages.map((m) => m.text), ['carol on B']);
});

test('table filter returns only that table and never leaks another', async () => {
  const onlyA = await listChat(`?tableId=${encodeURIComponent(tableA)}`);
  assert.equal(onlyA.status, 200);
  assert.deepEqual(onlyA.data.messages.map((m) => m.text), ['bob on A', 'alice on A']);
  assert.ok(onlyA.data.messages.every((m) => m.channel === `table:${tableA}`));

  const onlyB = await listChat(`?tableId=${encodeURIComponent(tableB)}`);
  assert.deepEqual(onlyB.data.messages.map((m) => m.text), ['carol on B']);

  const none = await listChat('?tableId=no-chat-here');
  assert.equal(none.status, 200);
  assert.deepEqual(none.data.messages, []);

  assert.equal((await listChat('?tableId=%3Cscript%3E')).status, 400, 'an invalid table id is refused');
});

test('delete removes the line from the list and table history, and audits it', async () => {
  const target = (await listChat(`?tableId=${encodeURIComponent(tableA)}`)).data.messages.find((m) => m.text === 'alice on A');
  const res = await deleteLine(target.id);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.channel, `table:${tableA}`);

  const after = await listChat(`?tableId=${encodeURIComponent(tableA)}`);
  assert.deepEqual(after.data.messages.map((m) => m.text), ['bob on A']);
  assert.deepEqual((await listChat(`?tableId=${encodeURIComponent(tableB)}`)).data.messages.map((m) => m.text), ['carol on B'],
    'other tables are untouched');

  // A player who joins after the delete no longer sees the line in history.
  const ws = srv.socket(carol.token);
  await ws.opened;
  ws.send({ type: 'join_table', tableId: tableA, observe: true });
  const history = await ws.nextType('chat_history');
  assert.deepEqual(history.lines.map((l) => l.message), ['bob on A']);
  await ws.close();

  const log = (await srv.get('/api/admin/audit', { token: admin })).data.log;
  const row = log.find((r) => r.action === 'chat_delete');
  assert.ok(row, 'chat_delete audit row written');
  assert.equal(row.actor, 'admin');
  assert.match(row.detail, new RegExp(`msg ${target.id} table:${tableA} user ${alice.id} \\(Mod Alice\\): alice on A`));

  assert.equal((await deleteLine(target.id)).status, 404, 'deleting twice is a 404');
});

test('the existing admin mute still works and silences the player at the table', async () => {
  const res = await srv.post(`/api/admin/users/${carol.id}`, { token: admin, body: { action: 'mute' } });
  assert.equal(res.status, 200);
  const me = await srv.get('/api/me', { token: carol.token });
  assert.equal(me.data.user.chat_muted, true);

  const ws = await sit(carol.token, tableB);
  ws.send({ type: 'chat', tableId: tableB, message: 'muted line' });
  await sleep(400);
  await ws.close();
  const lines = (await listChat(`?tableId=${encodeURIComponent(tableB)}`)).data.messages.map((m) => m.text);
  assert.ok(!lines.includes('muted line'), 'muted chat is not persisted');

  const log = (await srv.get('/api/admin/audit', { token: admin })).data.log;
  assert.ok(log.some((r) => r.action === 'mute' && r.detail === `user ${carol.id}`), 'mute is audited');
});

test('announcement POST /api/admin/chat is unchanged', async () => {
  assert.equal((await srv.post('/api/admin/chat', { token: admin, body: { message: '' } })).status, 400);
  const lobby = await srv.get('/api/chat');
  assert.ok(lobby.data.messages.some((m) => m.message === 'lobby notice'));
});
