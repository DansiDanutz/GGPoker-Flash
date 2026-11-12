// Native best-five showdown focus (ported from the Codex clone's REA-verified bestFiveFocus).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestFiveFocus, showdownFocus } from '../src/game/eval.ts';

const royal = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];

test('board-only Hold\'em winner focuses no hole cards', () => {
  assert.deepEqual(bestFiveFocus(['As', 'Ad'], royal), { hole: [], board: [0, 1, 2, 3, 4] });
});

test('equal-rank ordinal sum prefers diamonds over hearts (native NewHandVO rule)', () => {
  assert.deepEqual(bestFiveFocus(['Ah', 'Ad'], ['Ac', 'Kh', 'Qd', 'Js', 'Tc']), { hole: [1], board: [1, 2, 3, 4] });
});

test('Omaha 4/5/6 must use exactly two hole cards', () => {
  for (const count of [4, 5, 6]) {
    const hole = ['9h', '8h', '2c', '3c', '3d', '7d'].slice(0, count);
    assert.deepEqual(bestFiveFocus(hole, royal, true), { hole: [0, 1], board: [2, 3, 4] });
  }
});

test('short deck: A-6-7-8-9 straight and flush over full house', () => {
  assert.deepEqual(bestFiveFocus(['Ah', 'Kh'], ['6c', '7d', '8s', '9h', 'Qd'], false, true), { hole: [0], board: [0, 1, 2, 3] });
  assert.deepEqual(bestFiveFocus(['Ah', 'Kh'], ['Qh', 'Jh', '9h', 'As', 'Ad'], false, true), { hole: [0, 1], board: [0, 1, 2] });
});

test('both hole cards plus the highest-suit kicker', () => {
  assert.deepEqual(bestFiveFocus(['Ah', 'Ad'], ['Ac', 'As', 'Ks', 'Kd', '6s']), { hole: [0, 1], board: [0, 1, 2] });
});

test('does not mutate its inputs', () => {
  const hole = ['As', 'Ad'];
  const board = [...royal];
  const saved = JSON.stringify([hole, board]);
  bestFiveFocus(hole, board);
  assert.equal(JSON.stringify([hole, board]), saved);
});

test('returns null for incomplete, hidden or duplicate cards', () => {
  for (const [hole, board] of [
    [[], royal], [['As'], royal], [['As', 'Ad', 'Ac'], royal], [['As', 'Ad'], royal.slice(0, 4)],
    [['As', 'Ad'], ['As', ...royal.slice(1)]], [['??', '??'], royal],
  ]) assert.equal(bestFiveFocus(hole, board), null);
  assert.equal(bestFiveFocus(['2c', '3c'], royal, false, true), null, 'deuces are not in a short deck');
});

test('showdownFocus selects main-pot winners only and unions their board cards', () => {
  const board = ['2c', '7d', 'Ks', 'Kh', '9c'];
  const result = {
    reason: 'showdown',
    winners: [
      { seat: 1, cards: ['Kd', 'Qs'], potIndex: 0 },
      { seat: 4, cards: ['9d', '9h'], potIndex: 1 },
    ],
  };
  const focus = showdownFocus(result, board, 'holdem');
  // Trip kings with Q and 9 kickers: both hole cards, Ks Kh 9c from the board.
  assert.deepEqual(focus.board, [2, 3, 4]);
  assert.deepEqual(focus.hole, { 1: [0, 1] }, 'side-pot winner is not focused');
});

test('showdownFocus is empty for fold wins, hidden cards, run-it-twice and short boards', () => {
  const board = ['2c', '7d', 'Ks', 'Kh', '9c'];
  const win = { seat: 1, cards: ['Kd', 'Qs'], potIndex: 0 };
  assert.equal(showdownFocus({ reason: 'fold', winners: [win] }, board, 'holdem'), null);
  assert.equal(showdownFocus({ reason: 'showdown', runItTwice: true, winners: [win] }, board, 'holdem'), null);
  assert.equal(showdownFocus({ reason: 'showdown', winners: [win] }, board.slice(0, 4), 'holdem'), null);
  assert.equal(showdownFocus({ reason: 'showdown', winners: [{ ...win, cards: ['??', '??'] }] }, board, 'holdem'), null);
  assert.equal(showdownFocus(null, board, 'holdem'), null);
});

import { focusClass } from '../src/game/eval.ts';

test('focusClass lifts selected cards, dims the rest, and is inert without focus', () => {
  assert.equal(focusClass(undefined, 0), '');
  assert.equal(focusClass([0, 2], 2), 'focus-on');
  assert.equal(focusClass([0, 2], 1), 'focus-off');
  assert.equal(focusClass([], 0), 'focus-off', 'board-only winner dims both hole cards');
});
