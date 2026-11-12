// Native pot settlement (REA per-pot-results / Codex engine/pots.mjs splitPots+settlePots).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, oddChipOrder } from './pots.js';

const c = (key, amount, folded = false) => ({ key, amount, folded });

test('native fixture: adjacent layers with the same eligible seats merge before odd chips (17/17)', () => {
  const { pots, returns } = buildPots([c(0, 10), c(1, 10), c(2, 10), c(3, 3, true), c(4, 1, true)]);
  // Layers 1, 3 and 10 are all contested by seats 0,1,2 -> one 34-chip pot, split 17/17 on a tie.
  assert.deepEqual(pots, [{ amount: 34, eligible: [0, 1, 2] }]);
  assert.deepEqual(returns, []);
});

test('distinct eligible sets stay separate pots, and a single payer layer is returned', () => {
  const { pots, returns } = buildPots([c('a', 50), c('b', 100), c('x', 300)]);
  assert.deepEqual(pots, [
    { amount: 150, eligible: ['a', 'b', 'x'] },
    { amount: 100, eligible: ['b', 'x'] },
  ]);
  assert.deepEqual(returns, [{ key: 'x', amount: 200 }]);
});

test('a layer that no live player paid into joins the pot below it, so no chip is lost', () => {
  const { pots, returns } = buildPots([c('s', 50), c('f1', 100, true), c('f2', 100, true)]);
  assert.deepEqual(returns, []);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 250);
  assert.deepEqual(pots, [{ amount: 250, eligible: ['s'] }]);
});

test('odd chips go clockwise from the first winner left of the button', () => {
  // Button on seat 1 of 6: seat 2 is first, then 3 ... 0, 1.
  assert.deepEqual(oddChipOrder([0, 2], 1, 6), [2, 0]);
  assert.deepEqual(oddChipOrder([5, 1, 3], 4, 6), [5, 1, 3]);
  assert.deepEqual(oddChipOrder([1], 1, 6), [1]);
});

import { PokerTable } from './table.js';

const card = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
function riverTable(seats, button, contributions, folded, hands) {
  const t = new PokerTable({ id: 't', name: 't', game: 'holdem', seats, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {};
  for (let i = 0; i < seats; i++) t.sit({ id: 'p' + i, nick: 'p' + i }, i, 100);
  t.button = button; t.street = 'river'; t.board = ['Qs', 'Jd', '5c', '4s', '8d'].map(card);
  t.pot = contributions.reduce((a, b) => a + b, 0); t.ghosts = [];
  t.seats.forEach((s, i) => Object.assign(s.player, {
    inHand: true, folded: folded[i], totalBet: contributions[i], bet: 0, cards: hands[i].map(card), winAmount: 0,
  }));
  t.doShowdown();
  return t.seats.map((s) => s.player.winAmount);
}

test('table showdown: native fixture pays 17/17, not 18/16', () => {
  const won = riverTable(5, 4, [10, 10, 10, 3, 1], [false, false, false, true, true],
    [['Ah', 'Kd'], ['As', 'Kc'], ['2c', '3d'], ['7h', '8h'], ['9c', '9d']]);
  assert.deepEqual(won, [17, 17, 0, 0, 0]);
});

test('table showdown: the odd chip goes to the first winner left of the button', () => {
  const won = riverTable(3, 1, [1, 1, 1], [false, false, false], [['Ah', 'Kd'], ['2c', '3d'], ['As', 'Kc']]);
  assert.deepEqual(won, [1, 0, 2]);
});

test('run it twice pays out a departed player\'s chips too (no chip vanishes)', () => {
  const t = new PokerTable({ id: 't', name: 't', game: 'holdem', seats: 3, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {};
  t.sit({ id: 'p0', nick: 'p0' }, 0, 100);
  t.sit({ id: 'p1', nick: 'p1' }, 1, 100);
  t.button = 0; t.street = 'turn'; t.runItTwice = true;
  t.board = ['Qs', 'Jd', '5c', '4s'].map(card);
  t.ghosts = [{ id: 'gone', nick: 'gone', bet: 0, totalBet: 2 }];
  t.seats.filter((s) => s.player).forEach((s, i) => Object.assign(s.player, {
    inHand: true, folded: false, allIn: true, totalBet: 100, bet: 0, stack: 0,
    cards: [['Ah', 'Kd'], ['2c', '3d']][i].map(card), winAmount: 0,
  }));
  t.pot = 202;
  t.runoutTwice();
  const paid = t.seats.reduce((a, s) => a + (s.player?.stack || 0), 0);
  assert.equal(paid, 202);
});
