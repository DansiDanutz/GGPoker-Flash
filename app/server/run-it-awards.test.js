import test from 'node:test';
import assert from 'node:assert/strict';
import { boardAwards } from '../src/game/runItAwards.ts';

test('board awards deduplicate seats within a board and count split-board wins', () => {
  const byBoard = [
    [
      { id: 'a', nick: 'Ann', seat: 2, amount: 50, hand: 'Pair' },
      { id: 'a', nick: 'Ann', seat: 2, amount: 25, hand: 'Pair' },
      { id: 'b', nick: 'Bob', seat: 4, amount: 25, hand: 'Pair' },
    ],
    [{ id: 'a', nick: 'Ann', seat: 2, amount: 100, hand: 'Flush' }],
  ];

  assert.deepEqual(boardAwards(byBoard), [
    { board: 0, seats: [2, 4], winners: [{ seat: 2, nick: 'Ann' }, { seat: 4, nick: 'Bob' }], counts: [{ seat: 2, nick: 'Ann', boards: 1, won: 0, shared: 1 }, { seat: 4, nick: 'Bob', boards: 1, won: 0, shared: 1 }] },
    { board: 1, seats: [2], winners: [{ seat: 2, nick: 'Ann' }], counts: [{ seat: 2, nick: 'Ann', boards: 2, won: 1, shared: 1 }, { seat: 4, nick: 'Bob', boards: 1, won: 0, shared: 1 }] },
  ]);
});

test('board awards ignore malformed winners without inferring from aggregate payouts', () => {
  assert.deepEqual(boardAwards([[{ id: 'a', nick: 'Ann', seat: 1 }, { id: 'x', nick: 'No seat' }], []]), [
    { board: 0, seats: [1], winners: [{ seat: 1, nick: 'Ann' }], counts: [{ seat: 1, nick: 'Ann', boards: 1, won: 1, shared: 0 }] },
    { board: 1, seats: [], winners: [], counts: [{ seat: 1, nick: 'Ann', boards: 1, won: 1, shared: 0 }] },
  ]);
  assert.deepEqual(boardAwards(null), []);
});
