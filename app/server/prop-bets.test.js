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
      memo TEXT, reference TEXT, created_at TEXT, session_id TEXT, currency TEXT DEFAULT 'USD', UNIQUE (user_id, reference));
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
  const gameResult = (userId, amount) => ledger(userId, 'slots', amount, 'table', `g:${Math.random()}`);
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
  w.props.recordBust('t1', 2, 3);
  w.props.recordBust('t1', 1, 2);
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

test('Last Longer pays the higher official finish even if its callback arrives first', () => {
  const w = world(), bet = lastLonger(w);
  w.props.join(2, bet.id);
  w.props.recordBust('t1', 1, 4);
  w.props.recordBust('t1', 2, 5);
  w.db.prepare("UPDATE tournaments SET status='completed'").run();
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).winnerId, 1);
  assert.equal(w.balance(1), 10500);
});

test('a running Last Longer preserves a legacy elimination across upgrade and settles once', () => {
  const w = world(), bet = lastLonger(w);
  w.props.join(2, bet.id);
  w.props.join(3, bet.id);
  w.db.prepare("UPDATE tournaments SET status='running'").run();
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'running');
  // Pre-upgrade servers assigned the first elimination sequence number 1.
  w.db.prepare('UPDATE prop_bet_entries SET out_seq=1 WHERE bet_id=? AND user_id=3').run(bet.id);
  w.props.recordBust('t1', 1, 4);
  w.props.recordBust('t1', 2, 5);
  w.props.recordBust('t1', 3, 6);
  assert.equal(w.db.prepare('SELECT out_seq FROM prop_bet_entries WHERE bet_id=? AND user_id=3').get(bet.id).out_seq, 1);
  w.db.prepare("UPDATE tournaments SET status='completed'").run();
  for (let i = 0; i < 2; i++) {
    w.props.sweep();
    assert.deepEqual(w.props.detail(bet.id).entries.map(e => e.userId), [1, 2, 3]);
    assert.deepEqual([1, 2, 3].map(w.balance), [11000, 9500, 9500]);
  }
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

test('an existing funded Bankroll Challenge pays once when it expires during the creation pause', (t) => {
  const w = world();
  const bet = challenge(w, 'bankroll', { maxBettors: 1 });
  w.props.join(2, bet.id);
  const ownerAfterStake = w.balance(1);
  const bettorAfterStake = w.balance(2);
  const previous = process.env.GGPOKER_PAUSE_NEW_BANKROLL;
  process.env.GGPOKER_PAUSE_NEW_BANKROLL = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.GGPOKER_PAUSE_NEW_BANKROLL;
    else process.env.GGPOKER_PAUSE_NEW_BANKROLL = previous;
  });
  assert.throws(() => challenge(w, 'bankroll'), /paused/);
  w.clock.now = T0 + 11 * MIN;
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'running');
  w.clock.now += DAY;
  w.props.sweep();
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).status, 'settled');
  assert.equal(w.balance(1), ownerAfterStake);
  assert.equal(w.balance(2), bettorAfterStake + 2 * bet.amount);
  assert.equal(w.db.prepare("SELECT COUNT(*) n FROM transactions WHERE kind='propbet_win'").get().n, 1);
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

test('Bankroll Challenge counts net completed cash sessions and excludes earlier principal', () => {
  const w = world();
  const bet = challenge(w,'bankroll');
  w.props.join(2,bet.id);
  const entry = (session, kind, amount) => w.db.prepare('INSERT INTO transactions(user_id,kind,amount,session_id,created_at) VALUES(1,?,?,?,?)')
    .run(kind,amount,session,new Date(w.clock.now).toISOString());
  entry('earlier','buyin',-9000);
  w.clock.now = T0 + 11*MIN;
  entry('earlier','cashout',9000);
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).progress,0);
  entry('eligible','buyin',-1000);
  entry('eligible','rebuy',-500);
  entry('eligible','remove_chips',300);
  assert.equal(w.props.detail(bet.id).progress,0);
  entry('eligible','cashout',1400);
  assert.equal(w.props.detail(bet.id).progress,200);
  entry(null,'cashout',50000);
  assert.equal(w.props.detail(bet.id).progress,200);
});

test('Bankroll progress includes signed table-game results but excludes funding', () => {
  const w = world();
  const bet = challenge(w, 'bankroll');
  w.props.join(2, bet.id);
  w.clock.now = T0 + 11 * MIN;
  w.props.sweep();
  let expected = 0;
  for (const [kind, amount] of [['baccarat', 80], ['dragontiger', -30], ['sicbo', 20], ['deposit', 500]]) {
    w.db.prepare('INSERT INTO transactions(user_id,kind,amount,created_at) VALUES(1,?,?,?)')
      .run(kind, amount, new Date(w.clock.now).toISOString());
    if (kind !== 'deposit') expected += amount;
    assert.equal(w.props.detail(bet.id).progress, expected, kind);
  }
});

test('Bankroll progress respects millisecond bounds within the same second', () => {
  const w = world();
  const startAt = T0 + 10 * MIN + 500;
  const bet = challenge(w, 'bankroll', { startAt, endAt: startAt + DAY });
  w.props.join(2, bet.id);
  for (const [offset, amount] of [[-1, 400], [0, 20], [1, 30], [2, 80]]) {
    w.clock.now = startAt + offset;
    w.gameResult(1, amount);
  }
  w.clock.now = startAt + 1;
  w.props.sweep();
  assert.equal(w.props.detail(bet.id).progress, 50);
});

test('Blackjack progress counts only the net of hands opened and finished in the window', () => {
  const w = world();
  const bet = challenge(w, 'bankroll');
  w.props.join(2, bet.id);
  const log = (id, leg, amount) => w.db.prepare("INSERT INTO transactions(user_id,kind,amount,session_id,reference,created_at) VALUES(1,'blackjack',?,?,?,?)")
    .run(amount,id,'bj:'+leg+':'+id,new Date(w.clock.now).toISOString());
  log('early','stake',-100);
  w.clock.now = T0 + 11*MIN;
  w.props.sweep();
  log('early','end',200);
  log('push','stake',-100); log('push','end',100);
  log('open','stake',-100);
  assert.equal(w.props.detail(bet.id).progress,0);
  log('win','stake',-100); log('win','end',200);
  assert.equal(w.props.detail(bet.id).progress,100);
  log('open','end',0);
  assert.equal(w.props.detail(bet.id).progress,0);
});

test('Crash progress requires a matching in-window stake and terminal outcome', () => {
  const w = world();
  const bet = challenge(w, 'bankroll');
  w.props.join(2, bet.id);
  const log = (id, kind, amount) => w.db.prepare('INSERT INTO transactions(user_id,kind,amount,session_id,reference,created_at) VALUES(1,?,?,?,?,?)')
    .run(kind,amount,id,id && 'crash:' + (kind === 'crash_bet' ? 'stake:' : 'end:') + id,new Date(w.clock.now).toISOString());
  log('early','crash_bet',-100);
  w.clock.now = T0 + 11*MIN;
  w.props.sweep();
  log('early','crash_win',150);
  log(null,'crash_win',500);
  log('open','crash_bet',-100);
  assert.equal(w.props.detail(bet.id).progress,0);
  log('win','crash_bet',-100); log('win','crash_win',150);
  assert.equal(w.props.detail(bet.id).progress,50);
  log('open','crash_loss',0);
  assert.equal(w.props.detail(bet.id).progress,-50);
  log('late','crash_bet',-100);
  w.clock.now = T0 + 10*MIN + DAY + 1;
  log('late','crash_win',200);
  assert.equal(w.props.detail(bet.id).progress,-50);
});

test('tournament progress pairs each registration with its own in-window withdrawal or prize', () => {
  const w = world();
  const bet = challenge(w,'bankroll');
  w.props.join(2,bet.id);
  const put = (id, kind, amount, prefix) => w.db.prepare("INSERT INTO transactions(user_id,kind,amount,session_id,reference,created_at) VALUES(1,?,?,?,?,?)")
    .run(kind,amount,id,id && prefix+':'+id,new Date(w.clock.now).toISOString());
  put('early','tourney_buyin',-100,'entry');
  w.clock.now = T0 + 11*MIN;
  w.props.sweep();
  put('early','tourney_refund',100,'withdraw');
  put(null,'tourney_win',200,null);
  put('cancel','tourney_buyin',-200,'entry');
  put('cancel','tourney_refund',200,'withdraw');
  put('retry','tourney_buyin',-200,'entry');
  assert.equal(w.props.detail(bet.id).progress,0);
  put('early','bounty',300,'bounty:old-knockout');
  put('retry','mystery_bounty',75,'bounty:new-knockout');
  assert.equal(w.props.detail(bet.id).progress,0);
  put('retry','tourney_win',350,'prize');
  assert.equal(w.props.detail(bet.id).progress,225);
  put('busted','tourney_buyin',-100,'entry');
  put('busted','tourney_payout',0,'prize');
  assert.equal(w.props.detail(bet.id).progress,125);
  put('late','tourney_buyin',-100,'entry');
  w.clock.now = T0 + 10*MIN + DAY + 1;
  put('late','tourney_payout',200,'prize');
  assert.equal(w.props.detail(bet.id).progress,125);
});
