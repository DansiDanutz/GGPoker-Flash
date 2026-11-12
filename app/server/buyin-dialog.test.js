import test from 'node:test';
import assert from 'node:assert/strict';
import { buyInError, buyInLimits, parseBuyInText } from '../src/lib/buyIn.ts';

const fmt = (v) => `$${(v / 100).toFixed(2)}`;

test('the maximum is capped at the wallet balance', () => {
  assert.deepEqual(buyInLimits(2000, 10_000, 6500), { min: 2000, max: 6500, canAfford: true });
  assert.deepEqual(buyInLimits(2000, 10_000, 50_000), { min: 2000, max: 10_000, canAfford: true });
  assert.deepEqual(buyInLimits(2000, 10_000, undefined), { min: 2000, max: 10_000, canAfford: true });
});

test('a wallet below the table minimum cannot buy in', () => {
  const limits = buyInLimits(2000, 10_000, 1500);
  assert.equal(limits.canAfford, false);
  assert.match(buyInError(2000, limits, fmt), /balance is below the \$20\.00 minimum/);
});

test('typed amounts outside the bounds get a clear error', () => {
  const limits = buyInLimits(2000, 10_000, 6500);
  assert.equal(buyInError(2000, limits, fmt), null);
  assert.equal(buyInError(6500, limits, fmt), null);
  assert.equal(buyInError(1999, limits, fmt), 'The minimum buy-in is $20.00.');
  assert.equal(buyInError(6501, limits, fmt), 'The maximum you can buy in is $65.00.');
  assert.equal(buyInError(Number.NaN, limits, fmt), 'Enter a buy-in amount.');
});

test('typed text converts from the display unit to chips', () => {
  assert.equal(parseBuyInText('45', 100), 4500);
  assert.equal(parseBuyInText('45.505', 100), 4551);
  assert.equal(parseBuyInText(' 1,250 ', 1), 1250);
  assert.ok(Number.isNaN(parseBuyInText('', 100)));
  assert.ok(Number.isNaN(parseBuyInText('abc', 100)));
});
