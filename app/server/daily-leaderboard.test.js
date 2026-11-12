import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createDailyLeaderboard, dayOf, leaderboardStake, PRIZE_SPLIT, prizeShares, stakeKey, TOTAL_PRIZE_BB } from './dailyLeaderboard.js';

const DAY = Date.UTC(2026, 10, 12, 12);
const NEXT = DAY + 24 * 3600 * 1000;

function world() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, nick TEXT)');
  for (const [id, nick] of [[1, 'Ann'], [2, 'Bob'], [3, 'Cy']]) db.prepare('INSERT INTO users VALUES (?, ?)').run(id, nick);
  const paid = [];
  const board = createDailyLeaderboard(db, { pay: (userId, amount, memo, reference) => paid.push({ userId, amount, memo, reference }) });
  return { board, paid };
}

test('stake keys and UTC days', () => {
  assert.equal(stakeKey({ game: 'holdem', sb: 100, bb: 200 }), 'holdem:100/200');
  assert.equal(dayOf(DAY), '2026-11-12');
  assert.equal(PRIZE_SPLIT.reduce((a, b) => a + b, 0), 100);
});

test('prize shares follow the split and never exceed the total', () => {
  const shares = prizeShares(100000, 3);
  assert.deepEqual(shares, [30000, 20000, 15000]);
  assert.ok(prizeShares(99999, 10).reduce((a, b) => a + b, 0) <= 99999);
});

test('points accrue per stake and day; the view shows total prize, my points and rank', () => {
  const { board } = world();
  const stake = { key: 'holdem:100/200', bb: 200 };
  board.record({ stake, userIds: [1, 2], now: DAY });
  board.record({ stake, userIds: [2], now: DAY });
  board.record({ stake: { key: 'holdem:50/100', bb: 100 }, userIds: [1], now: DAY });
  const v = board.view({ stake, userId: 1, now: DAY });
  assert.equal(v.totalPrize, 200 * TOTAL_PRIZE_BB);
  assert.deepEqual([v.myPoints, v.myRank], [1, 2]);
  assert.deepEqual(v.top.map((r) => [r.nick, r.points, r.rank]), [['Bob', 2, 1], ['Ann', 1, 2]]);
  assert.deepEqual(board.view({ stake, userId: 3, now: DAY }).myRank, null);
});

test('a new day pays yesterday\'s leaders once, and the board starts empty', () => {
  const { board, paid } = world();
  const stake = { key: 'holdem:100/200', bb: 200 };
  board.record({ stake, userIds: [1, 2], now: DAY });
  board.record({ stake, userIds: [2], now: DAY });
  board.record({ stake, userIds: [3], now: NEXT });
  board.record({ stake, userIds: [3], now: NEXT });
  const total = 200 * TOTAL_PRIZE_BB;
  assert.deepEqual(paid.map((p) => [p.userId, p.amount]), [[2, total * 0.3], [1, total * 0.2]]);
  assert.match(paid[0].memo, /Daily Leaderboard/);
  assert.equal(new Set(paid.map((p) => p.reference)).size, 2);
  assert.deepEqual(board.view({ stake, userId: 3, now: NEXT }).top.map((r) => r.nick), ['Cy']);
});

test('only public cash tables count', () => {
  const cfg = { game: 'holdem', sb: 1, bb: 2 };
  assert.deepEqual(leaderboardStake({ cfg }), { key: 'holdem:1/2', bb: 2 });
  assert.equal(leaderboardStake({ cfg, tournament: {} }), null);
  assert.equal(leaderboardStake({ cfg, spin: true }), null);
  assert.equal(leaderboardStake({ cfg: { ...cfg, private: 1 } }), null);
});
