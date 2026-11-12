// Native street-end collection (REA six-seat-chip-motion-verification): when a betting round
// closes, every live wager slides into the pot over 400 ms with an ease-out-cubic curve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECT_MS, COLLECT_EASING, collectedWagers } from '../src/game/chipCollect.ts';

const seat = (s, bet) => ({ seat: s, bet });

test('collects every wager that clears when the street advances', () => {
  const prev = { street: 'preflop', players: [seat(0, 50), seat(1, 100), seat(2, 0)] };
  const next = { street: 'flop', players: [seat(0, 0), seat(1, 0), seat(2, 0)] };
  assert.deepEqual(collectedWagers(prev, next), [{ seat: 0, amount: 50 }, { seat: 1, amount: 100 }]);
});

test('collects at hand end too', () => {
  const prev = { street: 'river', players: [seat(3, 400)] };
  const next = { street: 'ended', players: [seat(3, 0)] };
  assert.deepEqual(collectedWagers(prev, next), [{ seat: 3, amount: 400 }]);
});

test('nothing moves while the street is unchanged', () => {
  const prev = { street: 'flop', players: [seat(0, 50)] };
  const next = { street: 'flop', players: [seat(0, 150)] };
  assert.deepEqual(collectedWagers(prev, next), []);
});

test('nothing moves without a previous state (reconnect does not replay)', () => {
  assert.deepEqual(collectedWagers(null, { street: 'flop', players: [seat(0, 0)] }), []);
});

test('skips empty seats and missing players', () => {
  const prev = { street: 'turn', players: [null, seat(1, 20), { seat: 2 }] };
  const next = { street: 'river', players: [] };
  assert.deepEqual(collectedWagers(prev, next), [{ seat: 1, amount: 20 }]);
});

test('timing matches native', () => {
  assert.equal(COLLECT_MS, 400);
  assert.equal(COLLECT_EASING, 'cubic-bezier(.33,1,.68,1)');
});
