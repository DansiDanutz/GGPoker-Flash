import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  CHAT_MAX_CHARS, CHAT_HISTORY_LIMIT, validateChat, validateReaction, reactionIdForEmote,
  appendLine, createSenderLimiter, createChatStore, createChatService, tableChannel,
} from './chat.js';

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, chat_muted INTEGER DEFAULT 0);
    CREATE TABLE table_mutes (table_id TEXT, user_id INTEGER);
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nick TEXT, table_id TEXT,
      channel TEXT DEFAULT 'lobby', message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
  return db;
}

test('validateChat trims, strips control characters and keeps 1–280 characters', () => {
  const cases = [
    ['  hello  ', 'hello'],
    ['a\u0000b\u0007c', 'abc'],
    ['line\none', 'line one'],
    ['‮evil', 'evil'],
    ['<img src=x>', '<img src=x>'],
    ['x'.repeat(CHAT_MAX_CHARS), 'x'.repeat(CHAT_MAX_CHARS)],
    ['😀'.repeat(CHAT_MAX_CHARS), '😀'.repeat(CHAT_MAX_CHARS)],
  ];
  for (const [input, expected] of cases) {
    const res = validateChat(input);
    assert.equal(res.ok, true, JSON.stringify(input));
    assert.equal(res.text, expected);
  }
  for (const bad of ['', '   ', '\u0000\u0001', 'x'.repeat(CHAT_MAX_CHARS + 1), null, undefined, 42, ['hi'], { text: 'hi' }]) {
    assert.equal(validateChat(bad).ok, false, JSON.stringify(bad));
  }
});

test('validateReaction accepts only allowlisted integer IDs', () => {
  for (const id of [1, 2, 3]) {
    const res = validateReaction(id);
    assert.equal(res.ok, true);
    assert.equal(res.reaction.id, id);
  }
  for (const bad of ['1', '2', 1.5, 0, 4, -1, NaN, Infinity, null, undefined, [1], {}, { id: 1 }, true, 'toString', '__proto__']) {
    assert.equal(validateReaction(bad).ok, false, String(JSON.stringify(bad)));
  }
});

test('legacy emote glyphs map to reaction IDs; others are dropped', () => {
  assert.equal(reactionIdForEmote('😂'), 3);
  assert.equal(reactionIdForEmote('😡'), 1);
  assert.equal(reactionIdForEmote('👂'), 2);
  assert.equal(reactionIdForEmote('🐟'), null);
  assert.equal(reactionIdForEmote('constructor'), null);
  assert.equal(reactionIdForEmote(3), null);
});

test('appendLine keeps the latest lines without mutating the input', () => {
  const full = Array.from({ length: CHAT_HISTORY_LIMIT }, (_, i) => ({ id: i }));
  const next = appendLine(full, { id: 99 });
  assert.equal(full.length, CHAT_HISTORY_LIMIT, 'input untouched');
  assert.equal(next.length, CHAT_HISTORY_LIMIT);
  assert.equal(next[0].id, 1);
  assert.equal(next.at(-1).id, 99);
  assert.deepEqual(appendLine([{ id: 1 }], { id: 2 }, 3).map((l) => l.id), [1, 2]);
});

test('sender limiter is per sender: one sender waiting never resets another', () => {
  const limiter = createSenderLimiter({ intervalMs: 1000 });
  assert.equal(limiter.tryAcquire(1, 0), true);
  assert.equal(limiter.tryAcquire(2, 100), true, 'sender 2 is not blocked by sender 1');
  assert.equal(limiter.tryAcquire(1, 500), false);
  assert.equal(limiter.tryAcquire(2, 600), false);
  assert.equal(limiter.tryAcquire(1, 1000), true, 'sender 1 frees up on its own clock');
  assert.equal(limiter.tryAcquire(2, 1050), false, 'sender 1 sending did not reset sender 2');
  assert.equal(limiter.tryAcquire(2, 1100), true);
});

test('chat store persists to table:<id> and rebuilds the latest 50 lines', () => {
  const db = memoryDb();
  const store = createChatStore(db);
  for (let i = 1; i <= CHAT_HISTORY_LIMIT + 5; i += 1) store.append('t1', { userId: 1, nick: 'A', message: `m${i}` });
  store.append('t2', { userId: 1, nick: 'A', message: 'other table' });
  const live = store.history('t1');
  assert.equal(live.length, CHAT_HISTORY_LIMIT);
  assert.equal(live[0].message, 'm6');
  assert.equal(live.at(-1).message, `m${CHAT_HISTORY_LIMIT + 5}`);
  const rows = db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE channel = ?').get(tableChannel('t1'));
  assert.equal(rows.n, CHAT_HISTORY_LIMIT + 5);

  const reloaded = createChatStore(db).history('t1');
  assert.deepEqual(reloaded.map((l) => l.message), live.map((l) => l.message), 'a restart restores the buffer');
  assert.deepEqual(createChatStore(db).history('t2').map((l) => l.message), ['other table']);
});

function fakeSocket(userId) {
  const sent = [];
  return { userId, nick: `U${userId}`, readyState: 1, sent, send: (raw) => sent.push(JSON.parse(raw)) };
}

function serviceFixture() {
  const db = memoryDb();
  db.prepare('INSERT INTO users (id) VALUES (1), (2), (3)').run();
  const seated = new Set([1, 2]);
  const player = fakeSocket(1);
  const other = fakeSocket(2);
  const observer = fakeSocket(3);
  const entry = { table: { seatOf: (id) => (seated.has(id) ? {} : null) }, clients: new Set([player, other, observer]) };
  const service = createChatService({ db, getEntry: (id) => (id === 't1' ? entry : undefined) });
  return { db, service, player, other, observer };
}

test('service broadcasts chat, rejects observers and drops muted senders', () => {
  const { db, service, player, other, observer } = serviceFixture();
  service.handleFrame(player, { type: 'chat', tableId: 't1', message: ' hi ' });
  assert.equal(other.sent.at(-1).event.message, 'hi');

  service.handleFrame(observer, { type: 'chat', tableId: 't1', message: 'hello' });
  assert.equal(observer.sent.at(-1).type, 'error');
  service.handleFrame(observer, { type: 'emote', tableId: 't1', emote: '😂' });
  assert.equal(observer.sent.at(-1).type, 'error');

  db.prepare('INSERT INTO table_mutes (table_id, user_id) VALUES (?, ?)').run('t1', 2);
  const before = player.sent.length;
  service.handleFrame(other, { type: 'chat', tableId: 't1', message: 'muted' });
  assert.equal(player.sent.length, before, 'a muted line reaches nobody');

  service.sendHistory(observer, 't1');
  assert.deepEqual(observer.sent.at(-1).lines.map((l) => l.message), ['hi']);
});

test('service maps reactions and legacy emotes, rejecting non-integer IDs', () => {
  const { service, player, other } = serviceFixture();
  service.handleFrame(player, { type: 'reaction', tableId: 't1', id: '1' });
  assert.equal(player.sent.at(-1).type, 'error');
  service.handleFrame(player, { type: 'emote', tableId: 't1', emote: '🤣' });
  assert.equal(other.sent.at(-1).event.reactionId, 3);
  assert.equal(other.sent.at(-1).event.label, 'Laughing');
});
