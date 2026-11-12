// Native per-pot awards (REA per-pot-awards.json, six-seat-chip-motion-verification.json):
// one transfer per pot share, starting at that pot's own position (TableSetting.potPositions),
// 400 ms ease-out cubic toward the winner, stopping 140 x player scale short, hold 1200 ms,
// fade 400 ms, with a moving amount label.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYOUT_TRANSFER_MS, PAYOUT_HOLD_MS, PAYOUT_FADE_MS, NATIVE_TABLE_WIDTH,
  payoutShares, potOffset, stopShort,
} from '../src/game/payoutMotion.ts';

test('native timings', () => {
  assert.deepEqual([PAYOUT_TRANSFER_MS, PAYOUT_HOLD_MS, PAYOUT_FADE_MS], [400, 1200, 400]);
});

test('one share per pot and winner, zero shares dropped, fold wins default to the main pot', () => {
  const shares = payoutShares([
    { seat: 2, amount: 50, potIndex: 1 },
    { seat: 1, amount: 94, potIndex: 0 },
    { seat: 2, amount: 0, potIndex: 0 },
    { seat: 4, amount: 30 },
  ]);
  assert.deepEqual(shares, [
    { seat: 1, amount: 94, potIndex: 0 },
    { seat: 4, amount: 30, potIndex: 0 },
    { seat: 2, amount: 50, potIndex: 1 },
  ]);
});

test('a split pot gives each winner its own share', () => {
  const shares = payoutShares([{ seat: 1, amount: 17, potIndex: 0 }, { seat: 3, amount: 17, potIndex: 0 }]);
  assert.equal(shares.length, 2);
});

test('pot origins are offsets from the main pot, scaled to the table width', () => {
  assert.deepEqual(potOffset(0, NATIVE_TABLE_WIDTH), [0, 0]);
  assert.deepEqual(potOffset(1, NATIVE_TABLE_WIDTH), [692 - 850, 706 - 663]);
  assert.deepEqual(potOffset(1, NATIVE_TABLE_WIDTH / 2), [(692 - 850) / 2, (706 - 663) / 2]);
  assert.deepEqual(potOffset(99, NATIVE_TABLE_WIDTH), [0, 0], 'unknown pots start at the main pot');
});

test('the transfer stops short of the winner', () => {
  assert.deepEqual(stopShort([0, 0], [300, 400], 100), [240, 320]);
  assert.deepEqual(stopShort([0, 0], [30, 40], 100), [0, 0], 'never overshoots backwards');
});
