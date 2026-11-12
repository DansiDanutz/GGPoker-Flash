import test from 'node:test';
import assert from 'node:assert/strict';
import { handStreetColumns } from '../src/lib/handDetail.ts';
import { showdownFocus, focusClass } from '../src/game/eval.ts';

const sampleActions = () => [
  { nick: 'Ann', action: 'raise', amount: 300, street: 'preflop' },
  { nick: 'Bob', action: 'call', amount: 300, street: 'preflop' },
  { nick: 'Ann', action: 'bet', amount: 200, street: 'flop' },
  { nick: 'Bob', action: 'fold', street: 'flop' },
  { nick: 'Ann', action: 'check', street: 'river' },
];

test('street columns group actions by preflop, flop, turn and river with amounts', () => {
  const columns = handStreetColumns(sampleActions());
  assert.deepEqual(columns.map((c) => c.title), ['Pre-Flop', 'Flop', 'Turn', 'River']);
  assert.deepEqual(columns[0].rows, [
    { nick: 'Ann', action: 'raise', amount: 300 },
    { nick: 'Bob', action: 'call', amount: 300 },
  ]);
  assert.deepEqual(columns[1].rows.map((r) => [r.action, r.amount]), [['bet', 200], ['fold', 0]]);
  assert.equal(columns[2].rows.length, 0, 'a street nobody acted on is an empty column');
  assert.equal(columns[3].rows[0].action, 'check');
});

test('actions without a street from older hands count as preflop and unknown streets are dropped', () => {
  const columns = handStreetColumns([
    { nick: 'Ann', action: 'call', amount: 100 },
    { nick: 'Bob', action: 'call', amount: 100, street: 'showdown' },
  ]);
  assert.equal(columns[0].rows.length, 1);
  assert.equal(columns.flatMap((c) => c.rows).length, 1);
});

test('street columns are derived without mutating the stored actions', () => {
  const actions = sampleActions();
  const before = structuredClone(actions);
  const columns = handStreetColumns(actions);
  columns[0].rows[0].amount = 999;
  assert.deepEqual(actions, before);
});

test('street columns tolerate missing or non-array input', () => {
  assert.equal(handStreetColumns(undefined).flatMap((c) => c.rows).length, 0);
  assert.equal(handStreetColumns(null).length, 4);
});

test('winning focus lights the winner best five and dims everything else', () => {
  const result = {
    reason: 'showdown',
    winners: [{ id: 1, seat: 0, cards: ['As', 'Ks'], potIndex: 0 }],
    hands: [{ seat: 0, cards: ['As', 'Ks'] }],
  };
  const board = ['Qs', 'Js', 'Ts', '2d', '3c'];
  const focus = showdownFocus(result, board, 'holdem');
  assert.deepEqual(focus.board, [0, 1, 2]);
  assert.deepEqual(focus.hole[0], [0, 1]);
  assert.equal(focusClass(focus.board, 0), 'focus-on');
  assert.equal(focusClass(focus.board, 3), 'focus-off');
  assert.equal(focusClass(undefined, 0), '');
});

test('winning focus ignores losers who mucked and is absent for folds and run-it-twice', () => {
  const board = ['Qs', 'Js', 'Ts', '2d', '3c'];
  const withLoser = showdownFocus({
    reason: 'showdown',
    winners: [{ id: 1, seat: 0, cards: ['As', 'Ks'], potIndex: 0 }],
    hands: [{ seat: 0, cards: ['As', 'Ks'] }, { seat: 1, cards: ['Qc', 'Qh'] }],
  }, board, 'holdem');
  assert.deepEqual(Object.keys(withLoser.hole), ['0']);
  assert.equal(showdownFocus({ reason: 'fold', winners: [{ id: 1, amount: 100 }] }, board, 'holdem'), null);
  assert.equal(showdownFocus({ reason: 'showdown', runItTwice: true, winners: [{ seat: 0, cards: ['As', 'Ks'] }] }, board, 'holdem'), null);
});
