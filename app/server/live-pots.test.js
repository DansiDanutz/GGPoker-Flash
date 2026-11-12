import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectedPots } from './pots.js';

const p = (key, totalBet, bet = 0, folded = false) => ({ key, totalBet, bet, folded });

test('posted blinds and current-street bets are not in the collected piles', () => {
  assert.deepEqual(collectedPots([p('a', 50, 50), p('b', 100, 100)]), []);
  assert.deepEqual(collectedPots([p('a', 140, 20), p('b', 130, 10), p('c', 120, 0)]), [360]);
});

test('an all-in short stack splits the collected chips into main and side piles', () => {
  // Native live fixture shape: piles stay as collected while a turn bet of 10 is outstanding.
  const piles = collectedPots([p('short', 40), p('a', 90, 10), p('b', 80), p('c', 40, 0, true)]);
  assert.deepEqual(piles, [160, 80]);
  assert.equal(piles.reduce((n, x) => n + x, 0), 240);
});

test('a single uncontested layer is not shown as its own pile', () => {
  assert.deepEqual(collectedPots([p('a', 100), p('b', 60)]), [120]);
});

import { PokerTable } from './table.js';

test('table snapshot carries the live piles during a hand and none between hands', () => {
  const t = new PokerTable({ id: 'lp', name: 'LP', game: 'holdem', sb: 50, bb: 100, seats: 3, min_buyin: 100, max_buyin: 100000 });
  const mk = (id, totalBet, bet, folded = false) => ({ id, nick: String(id), inHand: true, totalBet, bet, folded, cards: [], stack: 0 });
  t.seats[0].player = mk(1, 40, 0);
  t.seats[1].player = mk(2, 90, 10);
  t.seats[2].player = mk(3, 80, 0);
  t.street = 'turn';
  assert.deepEqual(t.livePots(), [120, 80]);
  t.street = 'ended';
  assert.deepEqual(t.livePots(), []);
});
