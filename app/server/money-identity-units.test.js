// Unit tests for the money and identity helpers (migrations, deposit caps, Add Chips
// reference, lobby occupancy, id-keyed HUD, Time Bank persistence, saved master volume).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { backfillWelcomeClaims, migrateIdentity, migrateNoteTargets } from './identity-migrations.js';
import { checkDeposit, cleanIdempotencyKey, depositLimits, rebuyReference, utcDayStart } from './play-money.js';
import { lobbyOccupancy, occupancyOf } from './lobby-occupancy.js';
import { playerHud, seatVpips } from './table-stats.js';
import { loadTimeBank, saveTimeBank } from './time-bank-store.js';
import { createPlayerNotes } from './player-notes.js';
import { savedVolume, DEFAULT_VOLUME } from '../src/lib/volume.ts';
import { previewSeats } from '../src/lib/lobbyPreview.ts';

function schema() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, nick TEXT, deleted_at TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, amount INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE bonus_claims (user_id INTEGER, claim_key TEXT, amount INTEGER, PRIMARY KEY (user_id, claim_key));
    CREATE TABLE player_notes (user_id INTEGER, target TEXT, note TEXT, color TEXT DEFAULT 'c9', updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (user_id, target));
  `);
  return db;
}

test('welcome backfill adds one claim per welcomed user and is idempotent', () => {
  const db = schema();
  db.exec(`INSERT INTO transactions (user_id, kind, amount) VALUES (1,'welcome',105000),(2,'deposit',500),(3,'welcome',105000)`);
  db.exec(`INSERT INTO bonus_claims VALUES (3,'welcome',100000)`);
  assert.equal(backfillWelcomeClaims(db), 1);
  assert.equal(backfillWelcomeClaims(db), 0);
  const keys = db.prepare('SELECT user_id FROM bonus_claims ORDER BY user_id').all().map((r) => r.user_id);
  assert.deepEqual(keys, [1, 3]);
});

test('note targets move from nicks to account ids, bots keep a nick key, reruns change nothing', () => {
  const db = schema();
  db.exec(`INSERT INTO users (id, nick) VALUES (7,'Shark')`);
  db.exec(`INSERT INTO player_notes (user_id, target, note) VALUES (1,'Shark','tight'),(1,'Bot Bob','spews'),(2,'u:7','keyed')`);
  migrateNoteTargets(db);
  migrateNoteTargets(db);
  const rows = db.prepare('SELECT user_id, target FROM player_notes ORDER BY user_id, target').all().map((r) => `${r.user_id}:${r.target}`);
  assert.deepEqual(rows, ['1:nick:Bot Bob', '1:u:7', '2:u:7']);
});

test('migrateIdentity adds the time bank columns once', () => {
  const db = schema();
  migrateIdentity(db);
  migrateIdentity(db);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.ok(cols.includes('time_bank_cards') && cols.includes('time_bank_hands'));
});

test('checkDeposit enforces the per-request and per-day caps', () => {
  const limits = { max: 100000, dailyMax: 500000 };
  assert.deepEqual(checkDeposit({ amount: 100000, today: 0, ...limits }), { ok: true });
  assert.equal(checkDeposit({ amount: 100001, today: 0, ...limits }).status, 400);
  const daily = checkDeposit({ amount: 50000, today: 460000, ...limits });
  assert.equal(daily.status, 429);
  assert.match(daily.error, /400 left today/);
  assert.equal(checkDeposit({ amount: 40000, today: 460000, ...limits }).ok, true);
});

test('deposit limits come from settings with safe defaults', () => {
  const settings = { deposit_max: 2000 };
  const get = (k, fallback) => (k in settings ? settings[k] : fallback);
  assert.deepEqual(depositLimits(get), { max: 2000, dailyMax: 500000 });
  assert.deepEqual(depositLimits(() => 'junk'), { max: 100000, dailyMax: 500000 });
  assert.equal(utcDayStart(new Date('2026-11-13T23:59:00Z')), '2026-11-13 00:00:00');
});

test('rebuyReference uses a valid client key and falls back to the counter', () => {
  assert.equal(rebuyReference('t:s', 2, 'dialog-1'), 'in:t:s:k:dialog-1');
  assert.equal(rebuyReference('t:s', 2, undefined), 'in:t:s:r2');
  assert.equal(rebuyReference('t:s', 2, 'bad key with spaces'), 'in:t:s:r2');
  assert.equal(cleanIdempotencyKey('x'.repeat(65)), null);
});

test('occupancyOf counts seated players and bots from the live table', () => {
  assert.deepEqual(occupancyOf(null), { players: 0, bots: 0, seated: [] });
  const table = { occupiedSeats: () => [
    { index: 0, player: { nick: 'Ann', stack: 5000 } },
    { index: 3, player: { nick: 'Bot', stack: 4000, isBot: true } },
  ] };
  assert.deepEqual(occupancyOf(table), {
    players: 2, bots: 1,
    seated: [{ seat: 0, nick: 'Ann', stack: 5000, bot: false }, { seat: 3, nick: 'Bot', stack: 4000, bot: true }],
  });
});

test('lobbyOccupancy restores stable demo counts only until a table is live', () => {
  const cfg = { id: 'bronze-1', name: 'Bronze 1', game: 'holdem', seats: 6 };
  const first = lobbyOccupancy(null, cfg);
  assert.ok(first.players >= 1 && first.players <= 6);
  assert.deepEqual(lobbyOccupancy(null, cfg), first, 'the demo count is stable across polls');
  assert.deepEqual(lobbyOccupancy({ occupiedSeats: () => [] }, cfg), { players: 0, bots: 0, seated: [] }, 'real occupancy wins once the table is live');
  assert.ok(lobbyOccupancy(null, { ...cfg, id: 'spin-1', game: 'spingold' }).players <= 2);
});

test('playerHud by id follows a rename and ignores a new holder of the old nick', () => {
  const hand = (players, actions) => ({ hand_no: 1, pot: 10, board: '', players: JSON.stringify(players), actions: JSON.stringify(actions) });
  const rows = [
    hand([{ id: 9, nick: 'Old', cards: ['Ah', 'Kh'] }], [{ nick: 'Old', action: 'raise', street: 'preflop' }]),
    hand([{ id: 9, nick: 'New', cards: ['2c', '3c'] }], [{ nick: 'New', action: 'call', street: 'preflop' }]),
    hand([{ id: 11, nick: 'Old', cards: ['4d', '5d'] }], [{ nick: 'Old', action: 'fold', street: 'preflop' }]),
  ];
  const hud = playerHud(rows, { id: 9, nick: 'New' });
  assert.equal(hud.hands, 2);
  assert.equal(hud.vpip, 100);
  assert.equal(hud.pfr, 50);
  assert.equal(playerHud(rows, { id: 11, nick: 'Old' }).vpip, 0);
  assert.equal(playerHud(rows, 'Old').hands, 2, 'a bare nick still matches by nick');
  assert.deepEqual({ ...seatVpips(rows, [{ id: 9, nick: 'New' }, 'Ghost']) }, { New: 100, Ghost: 0 });
});

test('time bank loads only on cash tables and saves humans only', () => {
  const cash = {};
  assert.deepEqual(loadTimeBank(cash, { time_bank_cards: 1, time_bank_hands: 4 }), { timeBankCards: 1, timeBankHands: 4 });
  assert.deepEqual(loadTimeBank(cash, { timeBankCards: 2, time_bank_cards: 1 }), { timeBankCards: 2, timeBankHands: undefined });
  assert.deepEqual(loadTimeBank({ tournament: {} }, { time_bank_cards: 1 }), { timeBankCards: undefined, timeBankHands: undefined });
  const db = schema();
  migrateIdentity(db);
  db.exec(`INSERT INTO users (id, nick) VALUES (5,'P')`);
  assert.equal(saveTimeBank(db, cash, { id: 5, timeBankCards: 1, timeBankHands: 7 }), true);
  assert.equal(saveTimeBank(db, cash, { id: 'bot-1', isBot: true, timeBankCards: 1 }), false);
  assert.equal(saveTimeBank(db, { spin: {} }, { id: 5, timeBankCards: 3 }), false);
  assert.deepEqual({ ...db.prepare('SELECT time_bank_cards c, time_bank_hands h FROM users WHERE id = 5').get() }, { c: 1, h: 7 });
});

test('player notes resolve a seated human to the account and a bot to a nick key', () => {
  const db = schema();
  db.exec(`INSERT INTO users (id, nick) VALUES (4,'Seated'),(6,'Elsewhere')`);
  const seated = { Seated: { id: 4 }, Botty: { id: 'bot-x', isBot: true } };
  const notes = createPlayerNotes(db, { findSeated: (nick) => seated[nick] || null });
  assert.equal(notes.resolveKey({ target: 'Seated' }), 'u:4');
  assert.equal(notes.resolveKey({ target: 'Botty' }), 'nick:Botty');
  assert.equal(notes.resolveKey({ target: 'Elsewhere' }), 'u:6');
  assert.equal(notes.resolveKey({ target: 'Nobody' }), 'nick:Nobody');
  assert.equal(notes.resolveKey({ targetId: 6 }), 'u:6');
  assert.equal(notes.resolveKey({}), null);
  notes.save(1, { target: 'Seated' }, 'nit', 'c0');
  assert.deepEqual(notes.list(1).map(({ key, target, targetId, note }) => ({ key, target, targetId, note })), [{ key: 'u:4', target: 'Seated', targetId: 4, note: 'nit' }]);
});

test('lobby preview chairs show the real seated players in seat order', () => {
  assert.deepEqual(previewSeats(undefined, 2), [{ seat: 0, name: '', stack: 0, empty: true }, { seat: 1, name: '', stack: 0, empty: true }]);
  const seats = previewSeats([{ seat: 5, nick: 'Z', stack: 9, bot: true }, { seat: 1, nick: 'A', stack: 4, bot: false }], 3);
  assert.deepEqual(seats.map((s) => s.name), ['A', 'Z', '']);
  assert.equal(seats[2].empty, true);
});

test('savedVolume restores the saved master volume and defaults to 70%', () => {
  assert.equal(savedVolume(null), DEFAULT_VOLUME);
  assert.equal(savedVolume('35'), 0.35);
  assert.equal(savedVolume('0'), 0);
  assert.equal(savedVolume('250'), 1);
  assert.equal(savedVolume('loud'), DEFAULT_VOLUME);
});
