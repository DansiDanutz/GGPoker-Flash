// Client Fast Fold button state (src/game/fastFold.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAST_FOLD_FREE_CHECK_TITLE, FAST_FOLD_TITLE, fastFoldButton, isRushGame } from '../src/game/fastFold.ts';

const live = Object.freeze({ inHand: true, folded: false, allIn: false });
const allowed = Object.freeze({ allowed: true, canCheck: false });

test('isRushGame covers Rush Hold\'em and Rush PLO only', () => {
  assert.equal(isRushGame('rush'), true);
  assert.equal(isRushGame('rushplo'), true);
  assert.equal(isRushGame('holdem'), false);
  assert.equal(isRushGame(undefined), false);
});

test('the button shows on Rush tables while the hero is live, before or on their turn', () => {
  assert.deepEqual(fastFoldButton('rush', 'preflop', live, allowed),
    { visible: true, enabled: true, warnCheck: false, title: FAST_FOLD_TITLE });
  assert.deepEqual(fastFoldButton('rushplo', 'river', live, allowed).visible, true);
});

test('the free-check big blind gets a warning; any other free check disables the button', () => {
  assert.equal(fastFoldButton('rush', 'preflop', live, { allowed: true, canCheck: true }).warnCheck, true);
  assert.deepEqual(fastFoldButton('rush', 'flop', live, { allowed: false, canCheck: false }),
    { visible: true, enabled: false, warnCheck: false, title: FAST_FOLD_FREE_CHECK_TITLE });
});

test('hidden off Rush, between hands, at showdown, and for folded, all-in or unseated heroes', () => {
  assert.deepEqual(fastFoldButton('holdem', 'preflop', live, allowed), { visible: false });
  assert.deepEqual(fastFoldButton('rush', 'ended', live, allowed), { visible: false });
  assert.deepEqual(fastFoldButton('rush', 'showdown', live, allowed), { visible: false });
  assert.deepEqual(fastFoldButton('rush', 'flop', { ...live, folded: true }, allowed), { visible: false });
  assert.deepEqual(fastFoldButton('rush', 'flop', { ...live, allIn: true }, allowed), { visible: false });
  assert.deepEqual(fastFoldButton('rush', 'flop', null, allowed), { visible: false });
});
