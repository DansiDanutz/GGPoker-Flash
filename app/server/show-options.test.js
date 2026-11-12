// Native ShowMuck after a hand: one button per hole card plus one for the whole hand
// (live capture: "Show [A] Show [B] Show [AB]").
import test from 'node:test';
import assert from 'node:assert/strict';
import { showOptions, cardGlyph } from '../src/game/showOptions.ts';

test('two cards: each card and both', () => {
  assert.deepEqual(showOptions(['As', 'Kd']), [
    { label: 'A♠', indices: [0] },
    { label: 'K♦', indices: [1] },
    { label: 'A♠ K♦', indices: [0, 1] },
  ]);
});

test('four cards: each card and all', () => {
  const opts = showOptions(['As', 'Kd', 'Th', '2c']);
  assert.equal(opts.length, 5);
  assert.deepEqual(opts[4].indices, [0, 1, 2, 3]);
});

test('hidden or missing cards give no options', () => {
  assert.deepEqual(showOptions([]), []);
  assert.deepEqual(showOptions(['??', '??']), []);
});

test('card glyphs', () => {
  assert.equal(cardGlyph('Tc'), '10♣');
  assert.equal(cardGlyph('9h'), '9♥');
});

import { canShowHand } from '../src/game/showOptions.ts';

// The own seat always arrives with reveal: true (so the player sees their cards); whether the
// hand was shown publicly is `shown` (all indices once fully revealed).
test('canShowHand: own snapshot after a fold can still show', () => {
  const me = { inHand: true, folded: true, cards: ['7c', '5c'], shown: [], reveal: true };
  assert.equal(canShowHand(me, 'ended', false), true);
});

test('canShowHand: not before the end, not twice, not for watchers or hidden cards', () => {
  const me = { inHand: true, cards: ['7c', '5c'], shown: [], reveal: true };
  assert.equal(canShowHand(me, 'river', false), false);
  assert.equal(canShowHand({ ...me, shown: [0] }, 'ended', false), false);
  assert.equal(canShowHand(me, 'ended', true), false);
  assert.equal(canShowHand({ ...me, cards: ['??', '??'] }, 'ended', false), false);
  assert.equal(canShowHand({ ...me, inHand: false }, 'ended', false), false);
  assert.equal(canShowHand(null, 'ended', false), false);
});
