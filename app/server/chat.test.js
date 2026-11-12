import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  CHAT_MAX_CHARS, CHAT_HISTORY_LIMIT, validateChat, validateReaction, reactionIdForEmote,
  appendLine, createSenderLimiter, createChatStore, createChatService, tableChannel,
  DEALER_NICK, dealerStartText, dealerResultText,
} from './chat.js';

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, chat_muted INTEGER DEFAULT 0);
    CREATE TABLE table_mutes (table_id TEXT, user_id INTEGER);
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nick TEXT, table_id TEXT,
      channel TEXT DEFAULT 'lobby', message TEXT NOT NULL, kind TEXT DEFAULT 'chat', created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

// ---- C4 dealer log (DanGG extra) ----

test('dealer text formats hand start and sums split winners per player', () => {
  assert.equal(dealerStartText(42), 'Hand #42 started');
  assert.equal(dealerResultText({ winners: [{ id: 1, nick: 'Ana', amount: 120, hand: 'Two Pair' }] }), 'Ana wins 120 with Two Pair');
  assert.equal(dealerResultText({ winners: [{ id: 1, nick: 'Ana', amount: 30, hand: null }] }), 'Ana wins 30', 'a fold win names no hand');
  assert.equal(dealerResultText({
    winners: [
      { id: 1, nick: 'Ana', amount: 50, hand: 'Flush' },
      { id: 2, nick: 'Bo', amount: 50, hand: 'Straight' },
      { id: 1, nick: 'Ana', amount: 25, hand: 'Flush' },
    ],
  }), 'Ana wins 75 with Flush; Bo wins 50 with Straight');
  assert.equal(dealerResultText({ winners: [] }), null);
  assert.equal(dealerResultText(null), null);
});

test('addSystemLine persists a dealer line and broadcasts it with kind dealer', () => {
  const { db, service, player, observer } = serviceFixture();
  const line = service.addSystemLine('t1', 'Hand #1 started', { key: 'start:h1' });
  assert.equal(line.kind, 'dealer');
  assert.equal(line.nick, DEALER_NICK);
  assert.equal(line.userId, null);
  for (const ws of [player, observer]) {
    const evt = ws.sent.at(-1).event;
    assert.equal(evt.type, 'chat');
    assert.equal(evt.kind, 'dealer');
    assert.equal(evt.nick, DEALER_NICK);
    assert.equal(evt.message, 'Hand #1 started');
  }
  const row = db.prepare('SELECT nick, kind, channel, user_id FROM chat_messages WHERE id = ?').get(line.id);
  assert.deepEqual({ ...row }, { nick: 'Dealer', kind: 'dealer', channel: tableChannel('t1'), user_id: null });
  service.sendHistory(observer, 't1');
  assert.equal(observer.sent.at(-1).lines.at(-1).kind, 'dealer', 'history keeps the kind');
  assert.equal(createChatStore(db).history('t1').at(-1).kind, 'dealer', 'a restart keeps the kind');
});

test('addSystemLine is idempotent per key and table', () => {
  const { db, service, other } = serviceFixture();
  assert.ok(service.addSystemLine('t1', 'Ana wins 10', { key: 'result:h1' }));
  const sent = other.sent.length;
  assert.equal(service.addSystemLine('t1', 'Ana wins 10', { key: 'result:h1' }), null);
  assert.equal(other.sent.length, sent, 'a repeat is not broadcast');
  assert.ok(service.addSystemLine('t2', 'Ana wins 10', { key: 'result:h1' }), 'another table has its own keys');
  assert.ok(service.addSystemLine('t1', 'Hand #2 started', { key: 'start:h2' }));
  const n = db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE kind = 'dealer'").get().n;
  assert.equal(n, 3);
  assert.equal(service.addSystemLine('t1', '   ', { key: 'blank' }), null, 'empty text is skipped');
});

test('dealer lines never touch the player sender limiter', () => {
  const { service, player, other } = serviceFixture();
  service.handleFrame(player, { type: 'chat', tableId: 't1', message: 'gl' });
  for (let i = 1; i <= 5; i += 1) assert.ok(service.addSystemLine('t1', `Hand #${i} started`, { key: `start:${i}` }));
  const before = player.sent.length;
  service.handleFrame(player, { type: 'chat', tableId: 't1', message: 'again' });
  assert.equal(player.sent.at(-1).type, 'error', 'the player is still limited on their own clock');
  assert.equal(player.sent.length, before + 1);
  service.handleFrame(other, { type: 'chat', tableId: 't1', message: 'hi' });
  assert.equal(other.sent.at(-1).event.message, 'hi', 'dealer lines did not consume another sender\'s slot');
  assert.equal(other.sent.at(-1).event.kind, 'chat');
});
