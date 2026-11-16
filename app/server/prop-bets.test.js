import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createPropBets, PROP_BET_RULES } from './prop-bets.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = Date.parse('2026-11-14T10:00:00Z');

/** A throwaway world: users, tournaments, registrations and an idempotent ledger. */
function world() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, nick TEXT, balance INTEGER, elo INTEGER DEFAULT 1000, deleted_at TEXT);
    CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT, start_at TEXT, status TEXT);
    CREATE TABLE tourney_regs (tournament_id TEXT, user_id INTEGER, PRIMARY KEY (tournament_id, user_id));
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, amount INTEGER,
      memo TEXT, reference TEXT, created_at TEXT, UNIQUE (user_id, reference));
  `);
  const clock = { now: T0 };
  const ledger = (userId, kind, amount, memo, reference) => {
    const info = db.prepare('INSERT OR IGNORE INTO transactions (user_id,kind,amount,memo,reference,created_at) VALUES (?,?,?,?,?,?)')
      .run(userId, kind, amount, memo, reference, new Date(clock.now).toISOString());
    if (info.changes) db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
    return { applied: info.changes > 0 };
  };
  for (const [id, nick] of [[1, 'Ana'], [2, 'Bo'], [3, 'Cy'], [4, 'Di']]) {
    db.prepare('INSERT INTO users (id,nick,balance) VALUES (?,?,?)').run(id, nick, 10_000);
  }
  db.prepare('INSERT INTO tournaments VALUES (?,?,?,?)').run('t1', 'Daily Classic', new Date(T0 + 30 * MIN).toISOString(), 'registering');
  for (const u of [1, 2, 3]) db.prepare('INSERT INTO tourney_regs VALUES (?,?)').run('t1', u);
  const props = createPropBets({ db, ledger, now: () => clock.now });
  props.ensureSchema();
  const balance = (id) => db.prepare('SELECT balance FROM users WHERE id = ?').get(id).balance;
  const gameResult = (userId, amount) => ledger(userId, 'cashout', amount, 'table', `g:${Math.random()}`);
  return { db, props, clock, balance, gameResult };
}

const lastLonger = (w, user = 1, extra = {}) => w.props.create(user, { type: 'last_longer', tournamentId: 't1', amount: 500, maxBettors: 4, ...extra });

test('rules expose the three bet types', () => {
  assert.deepEqual(Object.keys(PROP_BET_RULES).sort(), ['bankroll', 'elo', 'last_longer']);
});

test('Last Longer escrows the stake and lists the bet', () => {
  const w = world();
  const bet = lastLonger(w);
  assert.equal(w.balance(1), 9_500);
  const [listed] = w.props.list();
  assert.equal(listed.id, bet.id);
  assert.equal(listed.players, 1);
  assert.equal(listed.tournamentName, 'Daily Classic');
});

test('Last Longer needs a registration with at least 3 minutes to go', () => {
  const w = world();
  assert.throws(() => lastLonger(w, 4), /register/i);
  w.clock.now = T0 + 28 * MIN;
  assert.throws(() => lastLonger(w), /3 minutes/);
});

test('Last Longer rejects stakes the player cannot cover', () => {
  const w = world();
  assert.throws(() => lastLonger(w, 1, { amount: 50_000 }), /balance/i);
});

test('joining requires the same tournament and an open slot', () => {
  const w = world();
  const bet = lastLonger(w, 1, { maxBettors: 1 });
  assert.throws(() => w.props.join(4, bet.id), /register/i);
  w.props.join(2, bet.id);
  assert.equal(w.balance(2), 9_500);
  assert.throws(() => w.props.join(3, bet.id), /full/i);
  assert.throws(() => w.props.join(2, bet.id), /already/i);
});

test('the player who busts last wins the whole Last Longer pot', () => {
  const w = world();
  const bet = lastLonger(w);
  w.props.join(2, bet.id);
  w.props.join(3, bet.id);
  w.db.prepare("UPDATE tournaments SET status = 'running'").run();
  w.props.recordBust('t1', 2);
  w.props.recordBust('t1', 1);
  w.db.prepare("UPDATE tournaments SET status = 'completed'").run();
  w.props.sweep();
  const settled = w.props.detail(bet.id);
  assert.equal(settled.status, 'settled');
  assert.equal(settled.winnerId, 3);
  assert.equal(w.balance(3), 9_500 + 1_500);
  assert.deepEqual(settled.entries.map((e) => e.userId), [3, 1, 2], 'ranked by how long each lasted');
  w.props.sweep();
  assert.equal(w.balance(3), 11_000, 'settling twice pays once');
});

test('a Last Longer nobody joined is refunded at the start', () => {
  const w = world();
  const bet = lastLonger(w);
  w.clock.now = T0 + 31 * MIN;
  w.db.prepare("UPDATE tournaments SET status = 'running'").run();
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'refunded');
  assert.equal(w.balance(1), 10_000);
});

test('unregistering before the start refunds that player', () => {
  const w = world();
  const bet = lastLonger(w);
  w.props.join(2, bet.id);
  w.db.prepare('DELETE FROM tourney_regs WHERE user_id = 2').run();
  w.props.sweep();
  assert.equal(w.balance(2), 10_000);
  assert.equal(w.props.detail(bet.id).players, 1);
});

const challenge = (w, type, extra = {}) => w.props.create(1, {
  type, amount: 200, maxBettors: 2, goal: type === 'elo' ? 300 : 1_000,
  startAt: T0 + 10 * MIN, endAt: T0 + 10 * MIN + DAY, ...extra,
});

test('Bankroll Challenge escrows one stake per bettor slot', () => {
  const w = world();
  challenge(w, 'bankroll');
  assert.equal(w.balance(1), 9_600);
});

test('Bankroll Challenge validates goal and duration', () => {
  const w = world();
  assert.throws(() => challenge(w, 'bankroll', { goal: 0 }), /goal/i);
  assert.throws(() => challenge(w, 'bankroll', { endAt: T0 + 10 * MIN + 60 * MIN }), /1 day/);
  assert.throws(() => challenge(w, 'bankroll', { endAt: T0 + 10 * MIN + 101 * DAY }), /100 days/);
});

test('the creator cannot bet against their own challenge', () => {
  const w = world();
  const bet = challenge(w, 'bankroll');
  assert.throws(() => w.props.join(1, bet.id), /own/i);
});

test('Bankroll Challenge pays the creator when settled game results reach the goal', () => {
  const w = world();
  const bet = challenge(w, 'bankroll');
  w.props.join(2, bet.id);
  w.clock.now = T0 + 11 * MIN;
  w.props.sweep();
  assert.equal(w.balance(1), 9_800, 'the unfilled slot is refunded at the start');
  w.db.prepare("INSERT INTO transactions (user_id,kind,amount,memo,reference,created_at) VALUES (1,'deposit',50000,'top up','dep1',?)")
    .run(new Date(w.clock.now).toISOString());
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'running', 'cashier top-ups do not count');
  w.gameResult(1, 1_200);
  w.props.sweep();
  const done = w.props.detail(bet.id);
  assert.equal(done.status, 'settled');
  assert.equal(done.winnerId, 1);
  assert.equal(w.balance(1), 9_800 + 1_200 + 400);
});

test('Bankroll Challenge pays each bettor double when the end time passes', () => {
  const w = world();
  const bet = challenge(w, 'bankroll');
  w.props.join(2, bet.id);
  w.props.join(3, bet.id);
  w.clock.now = T0 + 11 * MIN + DAY;
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'settled');
  assert.equal(w.balance(2), 10_200);
  assert.equal(w.balance(3), 10_200);
  assert.equal(w.balance(1), 9_600);
});

test('ELO Challenge sets the goal from the rating at the start', () => {
  const w = world();
  const bet = challenge(w, 'elo');
  w.props.join(2, bet.id);
  w.db.prepare('UPDATE users SET elo = 1100 WHERE id = 1').run();
  w.clock.now = T0 + 11 * MIN;
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).target, 1_400);
  w.db.prepare('UPDATE users SET elo = 1400 WHERE id = 1').run();
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).winnerId, 1);
});

test('single-mode challenges move no money', () => {
  const w = world();
  const bet = challenge(w, 'elo', { maxBettors: 0 });
  assert.equal(w.balance(1), 10_000);
  w.clock.now = T0 + 11 * MIN + DAY;
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'settled');
  assert.equal(w.balance(1), 10_000);
});
