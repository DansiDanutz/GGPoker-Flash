import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

function seatedPlayer(id, seat) {
  return {
    id, nick: `P${id}`, avatar: '', stack: 10000, isBot: false, sittingOut: false, disconnected: false,
    inHand: true, folded: false, allIn: false, bet: 0, totalBet: 0, cards: [], acted: false,
    reveal: false, lastAction: null, winAmount: 0, seat, timeBank: 30, joinedAt: Date.now(),
    handsPlayed: 0, won: 0,
  };
}

function savedHandAfterFold({ sb = 50, bb = 100, ante = 0, seats = 3 } = {}) {
  const saved = [];
  const t = new PokerTable(
    { id: 'meta', name: 'Meta', game: 'holdem', sb, bb, ante, seats, min_buyin: 100, max_buyin: 100000 },
    { onHandSave: (h) => saved.push(h) },
  );
  for (let i = 0; i < seats; i++) t.seats[i].player = seatedPlayer(i + 1, i);
  t.startHand();
  const buttonAtDeal = t.button;
  t.finishByFold(t.seats[0]);
  return { hand: saved[0], buttonAtDeal };
}

test('a saved hand records the dealer button seat from the deal', () => {
  const { hand, buttonAtDeal } = savedHandAfterFold();
  assert.ok(buttonAtDeal >= 0, 'startHand assigns a button');
  assert.equal(hand.meta.button, buttonAtDeal);
});

test('a saved hand records the blinds and ante in force when the hand was dealt', () => {
  const { hand } = savedHandAfterFold({ sb: 25, bb: 50, ante: 5 });
  assert.deepEqual(hand.meta.blinds, { sb: 25, bb: 50, ante: 5 });
});

test('a later blind change does not rewrite the blinds recorded for a finished hand', () => {
  const saved = [];
  const t = new PokerTable(
    { id: 'meta', name: 'Meta', game: 'holdem', sb: 50, bb: 100, ante: 0, seats: 3, min_buyin: 100, max_buyin: 100000 },
    { onHandSave: (h) => saved.push(h) },
  );
  for (let i = 0; i < 3; i++) t.seats[i].player = seatedPlayer(i + 1, i);
  t.startHand();
  t.sb = 200;
  t.bb = 400;
  t.finishByFold(t.seats[0]);
  assert.deepEqual(saved[0].meta.blinds, { sb: 50, bb: 100, ante: 0 });
});
