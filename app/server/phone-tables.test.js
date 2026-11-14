// Phone cash-table rows: game tag colours and the seat-count chip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buyinStep, gameTone, maxLabel, stepBuyin } from '../src/lib/phoneTables.ts';

test('each cash game family gets its own tag colour', () => {
  assert.equal(gameTone('holdem'), 'red');
  assert.equal(gameTone('omaha'), 'blue');
  assert.equal(gameTone('omaha5'), 'green');
  assert.equal(gameTone('shortdeck'), 'violet');
  assert.equal(gameTone('rush'), 'amber');
});

test('unknown games fall back to the Hold\'em red', () => {
  assert.equal(gameTone('mystery-game'), 'red');
  assert.equal(gameTone(''), 'red');
});

test('seat chip reads N-Max, Heads-up for two, Table when unknown', () => {
  assert.equal(maxLabel(6), '6-Max');
  assert.equal(maxLabel(9), '9-Max');
  assert.equal(maxLabel(2), 'Heads-up');
  assert.equal(maxLabel(0), 'Table');
  assert.equal(maxLabel(Number.NaN), 'Table');
});

test('buy-in step is half a big blind, at least 100', () => {
  assert.equal(buyinStep({ bb: 2000, min_buyin: 0, max_buyin: 0 }), 1000);
  assert.equal(buyinStep({ bb: 50, min_buyin: 0, max_buyin: 0 }), 100);
});

test('the stepper stays between the table minimum and what the player can cover', () => {
  const t = { bb: 2000, min_buyin: 50000, max_buyin: 200000 };
  assert.equal(stepBuyin(t, 50000, 1, 600000), 51000);
  assert.equal(stepBuyin(t, 50000, -1, 600000), 50000);
  assert.equal(stepBuyin(t, 200000, 1, 600000), 200000);
  assert.equal(stepBuyin(t, 80000, 1, 80500), 80500);
  assert.equal(stepBuyin(t, 50000, 1), 50000);
});
