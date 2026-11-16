import test from 'node:test';
import assert from 'node:assert/strict';
import { handForViewer } from './hand-history.js';

const row = {
  id: 1, hand_no: 1, table_id: 't', table_name: 'T', game: 'holdem', board: 'As Kd Qh', pot: 100,
  players: JSON.stringify([
    { id: 1, nick: 'Folder', seat: 0, cards: ['7s', '2d'], inHand: true, folded: true, showed: true, shownIndices: [0] },
    { id: 2, nick: 'Winner', seat: 1, cards: ['Ac', 'Ad'], inHand: true, folded: false, showed: true },
  ]),
  result: JSON.stringify({ reason: 'showdown', winners: [{ seat: 1, cards: ['Ac', 'Ad'] }], hands: [{ seat: 0, cards: ['7s', '2d'] }, { seat: 1, cards: ['Ac', 'Ad'] }] }),
  actions: '[]', created_at: 'now', meta: '{}',
};

test('the folded owner retains their own cards in history', () => {
  const hand = handForViewer(row, 1);
  assert.deepEqual(hand.players[0].cards, ['7s', '2d']);
  assert.deepEqual(hand.result.hands[0].cards, ['7s', '2d']);
  assert.deepEqual(hand.players[1].cards, ['Ac', 'Ad']);
});

test('another participant sees the same legal partial reveal and no other private cards', () => {
  const hand = handForViewer(row, 2);
  assert.deepEqual(hand.players[0].cards, ['7s']);
  assert.deepEqual(hand.result.hands[0].cards, ['7s']);
});

test('an unrelated account cannot read the hand', () => {
  assert.equal(handForViewer(row, 99), null);
});
