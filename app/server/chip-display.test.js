// Chips / BB display for stacks, bets, the pot and the bet input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { amountLabel, bbLabel, betInputUnit, fromInputValue, toInputValue } from '../src/lib/chipDisplay.ts';

const fmt = (v) => `$${(v / 100).toFixed(2)}`;
const cash = (mode) => ({ mode, bb: 200, tournament: false, formatChips: fmt });

test('bbLabel uses one decimal', () => {
  assert.equal(bbLabel(1000, 200), '5.0 BB');
  assert.equal(bbLabel(250, 200), '1.3 BB');
});

test('amountLabel follows the display mode', () => {
  assert.equal(amountLabel(1000, cash('chips')), '$10.00');
  assert.equal(amountLabel(1000, cash('bb')), '5.0 BB');
  assert.equal(amountLabel(1000, cash('both')), '$10.00 · 5.0 BB');
});

test('tournaments and tables without a big blind always show chips', () => {
  assert.equal(amountLabel(1000, { ...cash('bb'), tournament: true }), '$10.00');
  assert.equal(amountLabel(1000, { ...cash('bb'), bb: 0 }), '$10.00');
});

test('null-ish amounts read as zero', () => {
  assert.equal(amountLabel(undefined, cash('bb')), '0.0 BB');
});

test('bet input works in BB only in BB mode on cash tables', () => {
  assert.deepEqual(betInputUnit(cash('bb')), { divisor: 200, suffix: 'BB' });
  assert.deepEqual(betInputUnit(cash('chips')), { divisor: 100, suffix: '' });
  assert.deepEqual(betInputUnit(cash('both')), { divisor: 100, suffix: '' });
  assert.deepEqual(betInputUnit({ ...cash('bb'), tournament: true }), { divisor: 1, suffix: '' });
});

test('input conversion round-trips and never changes the bet value', () => {
  assert.equal(toInputValue(1000, 200), 5);
  assert.equal(toInputValue(1050, 200), 5.25);
  assert.equal(fromInputValue(5.25, 200), 1050);
  assert.equal(fromInputValue(12.34, 100), 1234);
  assert.equal(fromInputValue(Number.NaN, 200), 0);
  for (const raw of [200, 450, 1234, 99999]) assert.equal(fromInputValue(toInputValue(raw, 100), 100), raw);
});
