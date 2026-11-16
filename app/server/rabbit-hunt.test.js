import test from 'node:test';
import assert from 'node:assert/strict';
import { rabbitRunout, rabbitEligible } from './rabbit-hunt.js';

const base = {
  game: 'holdem', street: 'ended', board: ['As', 'Kd', 'Qh'], deck: ['2c', '3d', '4h', '5s', '6c'], boards: null,
};

test('Rabbit Hunt deals only the missing cards without mutating the real board or deck', () => {
  const board = [...base.board];
  const deck = [...base.deck];
  assert.deepEqual(rabbitRunout(base), ['6c', '5s']);
  assert.deepEqual(base.board, board);
  assert.deepEqual(base.deck, deck);
});

test('Rabbit Hunt supports preflop and rejects a full board or active hand', () => {
  assert.deepEqual(rabbitRunout({ ...base, board: [] }), ['6c', '5s', '4h', '3d', '2c']);
  assert.equal(rabbitRunout({ ...base, board: ['As', 'Kd', 'Qh', 'Jc', 'Ts'] }), null);
  assert.equal(rabbitRunout({ ...base, street: 'river' }), null);
  assert.equal(rabbitRunout({ ...base, board: ['As', 'Kd'] }), null);
});

test('Rabbit Hunt rejects multi-board, unsupported games and insufficient decks', () => {
  assert.equal(rabbitRunout({ ...base, boards: [base.board, ['2h', '3h', '4h']] }), null);
  for (const game of ['rush', 'aof', 'shortdeck', 'spingold', 'battleroyale', 'tournament']) {
    assert.equal(rabbitRunout({ ...base, game }), null);
  }
  assert.equal(rabbitRunout({ ...base, deck: ['2c'] }), null);
});

test('Rabbit Hunt allows dealt participants in Holdem and all local PLO hole counts', () => {
  for (const game of ['holdem', 'omaha', 'omaha5', 'omaha6']) {
    assert.equal(rabbitEligible({ ...base, game }, 42, [{ id: 42, inHand: true }]), true);
  }
});

test('Rabbit Hunt never allows spectators, later seats or departed nonparticipants', () => {
  assert.equal(rabbitEligible(base, 42, []), false);
  assert.equal(rabbitEligible(base, 42, [{ id: 42, inHand: false }]), false);
  assert.equal(rabbitEligible(base, 42, [{ id: 7, inHand: true }]), false);
});

test('Rabbit Hunt rejects malformed cards and duplicated deck state', () => {
  assert.equal(rabbitRunout({ ...base, deck: ['not-a-card', '3d'] }), null);
  assert.equal(rabbitRunout({ ...base, deck: ['As', '3d'] }), null);
  assert.equal(rabbitRunout({ ...base, deck: ['2c', '2c'] }), null);
});
