// The idle-table close must not undo the disconnect protection (EGM round 3):
// a dropped player's live hand and a running Spin seat survive an empty table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canCloseIdleTable } from './idle-close.js';

const human = (over = {}) => ({ id: 1, isBot: false, inHand: false, folded: true, ...over });
const table = ({ live = false, spin = false, players = [] } = {}) => ({
  handInProgress: () => live,
  spinStarted: () => spin,
  humans: () => players,
});

test('an empty idle table with nobody in a hand may close', () => {
  assert.equal(canCloseIdleTable(table({ players: [human()] })), true);
  assert.equal(canCloseIdleTable(table({ live: true, players: [human()] })), true, 'a folded human has nothing at stake');
});

test('a human still holding a live hand keeps the table open until the hand ends', () => {
  assert.equal(canCloseIdleTable(table({ live: true, players: [human({ inHand: true, folded: false })] })), false);
});

test('a running Spin with a seated human is never closed by idleness', () => {
  assert.equal(canCloseIdleTable(table({ spin: true, players: [human()] })), false);
  assert.equal(canCloseIdleTable(table({ spin: true, players: [] })), true, 'nobody left to protect');
});
