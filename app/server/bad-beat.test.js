import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badBeatPayout as rawPayout, jackpotAccrual, BBJ_PAYOUT_FRACTION } from './badBeat.js';

// One pot everybody at showdown contested, won by winnerIds.
const badBeatPayout = ({ winnerIds, pots, ...hand }) => rawPayout({
  ...hand, pots: pots || [{ eligibleIds: hand.scored.map((c) => c.id), winnerIds }],
});

const quads = (rank) => [7, rank, 2];
const sf = (high) => [8, high];

test('no payout when the losing hand is below the trigger', () => {
  const out = badBeatPayout({
    pool: 100000, omaha: false,
    scored: [
      { id: 'a', score: sf(9), hole: ['9h', '8h'], best: ['9h', '8h', '7h', '6h', '5h'] },
      { id: 'b', score: quads(7), hole: ['7s', '7c'], best: ['7s', '7c', '7h', '7d', 'Ks'] },
    ],
    winnerIds: ['a'], dealtIn: ['a', 'b', 'c'],
  });
  assert.equal(out, null);
});

test('quad 8s or better beaten pays the winner, the opponent and the rest of the table', () => {
  const out = badBeatPayout({
    pool: 100000, omaha: false,
    scored: [
      { id: 'a', score: sf(9), hole: ['9h', '8h'], best: ['9h', '8h', '7h', '6h', '5h'] },
      { id: 'b', score: quads(8), hole: ['8s', '8c'], best: ['8s', '8c', '8d', '8x', 'Ks'] },
    ],
    winnerIds: ['a'], dealtIn: ['a', 'b', 'c', 'd'],
  });
  const total = 100000 * BBJ_PAYOUT_FRACTION;
  assert.equal(out.total, total);
  assert.deepEqual(out.shares.map((s) => [s.id, s.role]), [['b', 'winner'], ['a', 'opponent'], ['c', 'table'], ['d', 'table']]);
  assert.equal(out.shares.reduce((n, s) => n + s.amount, 0), total);
  assert.equal(out.shares[0].amount, total / 2);
  assert.equal(out.shares[1].amount, total / 4);
});

test('a hold\'em bad beat hand must use both hole cards', () => {
  const out = badBeatPayout({
    pool: 100000, omaha: false,
    scored: [
      { id: 'a', score: sf(9), hole: ['9h', '8h'], best: ['9h', '8h', '7h', '6h', '5h'] },
      { id: 'b', score: quads(8), hole: ['8s', '2c'], best: ['8s', '8c', '8d', '8x', 'Ks'] },
    ],
    winnerIds: ['a'], dealtIn: ['a', 'b'],
  });
  assert.equal(out, null);
});

test('heads-up: the rest-of-table share goes to the bad beat winner, chips are conserved', () => {
  const out = badBeatPayout({
    pool: 99999, omaha: false,
    scored: [
      { id: 'a', score: sf(9), hole: ['9h', '8h'], best: ['9h', '8h', '7h', '6h', '5h'] },
      { id: 'b', score: quads(14), hole: ['As', 'Ac'], best: ['As', 'Ac', 'Ad', 'Ah', 'Ks'] },
    ],
    winnerIds: ['a'], dealtIn: ['a', 'b'],
  });
  assert.deepEqual(out.shares.map((s) => s.role), ['winner', 'opponent']);
  assert.equal(out.shares.reduce((n, s) => n + s.amount, 0), out.total);
});

test('omaha needs a straight flush to qualify', () => {
  const base = { pool: 100000, omaha: true, winnerIds: ['a'], dealtIn: ['a', 'b'] };
  const winner = { id: 'a', score: sf(13), hole: ['Kh', 'Qh', '2c', '3c'], best: [] };
  assert.equal(badBeatPayout({ ...base, scored: [winner, { id: 'b', score: quads(14), hole: [], best: [] }] }), null);
  assert.ok(badBeatPayout({ ...base, scored: [winner, { id: 'b', score: sf(9), hole: [], best: [] }] }));
});

test('empty pool or no showdown loser pays nothing', () => {
  const scored = [{ id: 'a', score: sf(9), hole: ['9h', '8h'], best: ['9h', '8h'] }];
  assert.equal(badBeatPayout({ pool: 0, omaha: false, scored, winnerIds: ['a'], dealtIn: ['a'] }), null);
  assert.equal(badBeatPayout({ pool: 1000, omaha: false, scored, winnerIds: ['a'], dealtIn: ['a'] }), null);
});

test('a hand that loses the main pot but wins a side pot is still beaten', () => {
  const out = badBeatPayout({
    pool: 100000, omaha: false, dealtIn: ['short', 'aces', 'kings'],
    scored: [
      { id: 'short', score: sf(9), hole: ['9h', '8h'], best: ['9h', '8h', '7h', '6h', '5h'] },
      { id: 'aces', score: quads(14), hole: ['As', 'Ac'], best: ['As', 'Ac', 'Ah', 'Ad', '7h'] },
      { id: 'kings', score: [6, 14, 13], hole: ['Ks', 'Kd'], best: [] },
    ],
    pots: [
      { eligibleIds: ['short', 'aces', 'kings'], winnerIds: ['short'] },
      { eligibleIds: ['aces', 'kings'], winnerIds: ['aces'] },
    ],
  });
  assert.deepEqual(out.shares.map((s) => [s.id, s.role]), [['aces', 'winner'], ['short', 'opponent'], ['kings', 'table']]);
});

test('accrual takes a share of the rake, never negative', () => {
  assert.equal(jackpotAccrual(100), 25);
  assert.equal(jackpotAccrual(3), 0);
  assert.equal(jackpotAccrual(0), 0);
  assert.equal(jackpotAccrual(-5), 0);
});

import { PokerTable } from './table.js';

const C = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
const seatPlayer = (id, cards, folded = false) => ({
  id, nick: id, avatar: '', stack: 1000, isBot: false, sittingOut: false, disconnected: false,
  inHand: true, folded, allIn: false, bet: 0, totalBet: 500, cards: cards.map(C), acted: true,
  reveal: false, lastAction: null, winAmount: 0, seat: 0, timeBank: 30, joinedAt: Date.now(), handsPlayed: 0, won: 0,
});

function showdownTable(hooks, cfg = {}) {
  const players = [seatPlayer('sf', ['9h', '8h']), seatPlayer('quads', ['As', 'Ac']), seatPlayer('rest', ['2c', '3d'], true)];
  const t = new PokerTable({ id: 'bbj', name: 'BBJ', game: 'holdem', sb: 50, bb: 100, seats: 3, min_buyin: 100, max_buyin: 100000, ...cfg }, hooks);
  players.forEach((p, i) => { p.seat = i; t.seats[i].player = p; });
  t.pot = 1500;
  t.street = 'river';
  t.handNo = 1;
  t.board = ['Ah', 'Ad', '7h', '6h', '5h'].map(C);
  return t;
}

test('table: quad aces beaten by a straight flush pays the jackpot into stacks and announces it', () => {
  let paid = null;
  const events = [];
  const t = showdownTable({
    jackpotPool: () => 100000, onBadBeatJackpot: (_t, bb) => { paid = bb; }, onEvent: (_t, e) => events.push(e),
  });
  const before = t.seats.map((s) => s.player.stack);
  t.doShowdown();
  assert.equal(paid.total, 10000);
  assert.deepEqual(paid.shares.map((s) => [s.nick, s.role]), [['quads', 'winner'], ['sf', 'opponent'], ['rest', 'table']]);
  assert.equal(t.seats[1].player.stack - before[1], 5000);
  assert.equal(t.seats[2].player.stack - before[2], 2500);
  assert.equal(t.result.badBeat.total, 10000);
  assert.ok(events.some((e) => e.type === 'bad_beat_jackpot' && e.total === 10000));
});

test('table: no jackpot in tournaments or without a pool hook', () => {
  const none = showdownTable({});
  none.doShowdown();
  assert.equal(none.result.badBeat, undefined);
  const aof = showdownTable({ jackpotPool: () => 100000 }, { game: 'aof' });
  aof.doShowdown();
  assert.equal(aof.result.badBeat, undefined);
});

test('table: a player who folded and left mid-hand still gets their table share', () => {
  let paid = null;
  const t = showdownTable({ jackpotPool: () => 100000, onBadBeatJackpot: (_t, bb) => { paid = bb; } });
  const leaver = t.seats[2].player;
  t.seats[2].player = null;
  t.ghosts.push({ id: leaver.id, nick: leaver.nick, bet: 0, totalBet: leaver.totalBet });
  t.doShowdown();
  const rest = paid.shares.find((s) => s.role === 'table');
  assert.deepEqual([rest.id, rest.nick, rest.seat, rest.departed, rest.amount], ['rest', 'rest', -1, true, 2500]);
  assert.equal(paid.shares.find((s) => s.role === 'winner').amount, 5000);
});
