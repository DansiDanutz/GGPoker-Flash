import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleHandError, STALE_ACTION_ERROR } from './action-version.js';

const table = { handNo: 12 };

test('an action without a hand number is accepted (older clients)', () => {
  assert.equal(staleHandError(table, { type: 'action', action: 'fold' }), null);
  assert.equal(staleHandError(table, { type: 'action', action: 'fold', handNo: null }), null);
});

test('an action for the current hand is accepted', () => {
  assert.equal(staleHandError(table, { handNo: 12 }), null);
  assert.equal(staleHandError(table, { handNo: '12' }), null);
});

test('an action sent for an earlier (or any other) hand is rejected', () => {
  assert.equal(staleHandError(table, { handNo: 11 }), STALE_ACTION_ERROR);
  assert.equal(staleHandError(table, { handNo: 13 }), STALE_ACTION_ERROR);
  assert.equal(staleHandError(table, { handNo: 'abc' }), STALE_ACTION_ERROR);
  assert.match(STALE_ACTION_ERROR, /hand/i);
});

import { staleTurnError, STALE_TURN_ERROR } from './action-version.js';
import { PokerTable } from './table.js';

test('an action stamped with an earlier turn of the same hand is rejected', () => {
  const t = { handNo: 12, turnNo: 40 };
  assert.equal(staleTurnError(t, { action: 'check', turnNo: 40 }), null);
  assert.equal(staleTurnError(t, { action: 'check', turnNo: '40' }), null);
  assert.equal(staleTurnError(t, { action: 'check', turnNo: 38 }), STALE_TURN_ERROR, 'a double tap from the flop must not act on the turn');
  assert.equal(staleTurnError(t, { action: 'check' }), null, 'older clients without a turn number still work');
  assert.equal(staleTurnError(t, { action: 'quickfold', turnNo: 1 }), null, 'Fast Fold is valid before your turn');
});

test('each new turn gets a new number, and the snapshot carries it', () => {
  const t = new PokerTable({ id: 'tn', name: 'TN', game: 'holdem', sb: 50, bb: 100, seats: 2, min_buyin: 1000, max_buyin: 5000 });
  t.seats[0].player = { id: 1, nick: 'A', stack: 1000, cards: [], inHand: true };
  t.seats[1].player = { id: 2, nick: 'B', stack: 1000, cards: [], inHand: true };
  const before = t.turnNo;
  t.setActor(1);
  t.setActor(2);
  assert.equal(t.turnNo, before + 2);
  assert.equal(t.snapshotFor(1).turnNo, t.turnNo);
});
