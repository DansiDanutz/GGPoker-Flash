// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

test('billing gate prevents a new deal without taking blinds and permits a paid deal', () => {
  let funded = false;
  const table = new PokerTable({ id: 'billing-gate', name: 'Billing gate', game: 'holdem', sb: 50, bb: 100, ante: 0, seats: 2, min_buyin: 100, max_buyin: 10000 }, { canStartHand: () => funded });
  for (let seat = 0; seat < 2; seat++) table.seats[seat].player = {
    id: seat + 1, nick: `P${seat}`, stack: 1000, seat, isBot: false, sittingOut: false, disconnected: false,
    inHand: false, folded: false, allIn: false, bet: 0, totalBet: 0, cards: [], acted: false,
    reveal: false, lastAction: null, winAmount: 0, timeBank: 30, joinedAt: Date.now(), handsPlayed: 0, won: 0,
  };
  table.startHand();
  assert.deepEqual(table.seats.map((seat) => seat.player.stack), [1000, 1000]);
  assert.ok(table.seats.every((seat) => seat.player.cards.length === 0));
  funded = true;
  table.startHand();
  assert.equal(table.street, 'preflop');
  assert.equal(table.seats.reduce((sum, seat) => sum + seat.player.stack, 0), 1850);
  // Removing funding does not interfere with settlement of the current hand.
  funded = false;
  table.finishByFold(table.seats[0]);
  assert.equal(table.street, 'ended');
});
