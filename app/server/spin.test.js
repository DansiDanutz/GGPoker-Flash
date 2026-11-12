// Spin & Gold verified play-money table (slice S1a), ported 1:1 from Codex `spin-test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prizeAmounts, SPIN_MULTIPLIERS, SPIN_STAKES, SPIN_TICKET_TOTAL, spinBlindLevel, spinOutcome,
  spinPayouts, spinSmallBlinds,
} from './spin.js';

// [multiplier, frequency, prizes at 5000 buy-in, unit, interval]
const EXPECTED = [
  [20000, 5, [50000000, 30000000, 20000000], 'hands', 20],
  [100, 4000, [300000, 150000, 50000], 'hands', 15],
  [50, 8000, [150000, 75000, 25000], 'hands', 15],
  [10, 2450000, [40000, 10000, 0], 'hands', 10],
  [5, 2800000, [25000, 0, 0], 'minutes', 3],
  [4, 3000000, [20000, 0, 0], 'minutes', 2],
  [3, 44124010, [15000, 0, 0], 'minutes', 2],
  [2, 47613985, [10000, 0, 0], 'minutes', 1],
];
const clock = (overrides) => ({ startedAt: 0, now: 0, completedHands: 0, ...overrides });

test('frequencies sum to 100,000,000 and the expected value is 2.79x for both stakes', () => {
  assert.equal(SPIN_TICKET_TOTAL, 100000000);
  assert.deepEqual(SPIN_STAKES, [5000, 10000]);
  for (const buyIn of SPIN_STAKES) {
    const rows = spinPayouts(buyIn);
    assert.equal(rows.reduce((n, r) => n + r.frequency, 0), SPIN_TICKET_TOTAL);
    assert.equal(rows.reduce((n, r) => n + BigInt(r.frequency) * BigInt(r.multiplier), 0n), 279000000n);
  }
});

test('rows keep the exact verified order, frequencies, shares and blind schedule', () => {
  assert.deepEqual(SPIN_MULTIPLIERS, EXPECTED.map(([m]) => m));
  for (const buyIn of SPIN_STAKES) {
    const rows = spinPayouts(buyIn);
    assert.equal(rows.length, EXPECTED.length);
    EXPECTED.forEach(([multiplier, frequency, prizes, unit, interval], i) => {
      assert.deepEqual(rows[i], {
        multiplier, frequency, prizePool: buyIn * multiplier,
        prizes: prizes.map((n) => (n * buyIn) / 5000), unit, interval,
      });
    });
  }
});

test('payouts are whole chips that sum to buyIn * multiplier', () => {
  for (const buyIn of SPIN_STAKES) {
    for (const row of spinPayouts(buyIn)) {
      assert.equal(row.prizes.length, 3);
      assert.ok(row.prizes.every(Number.isSafeInteger));
      assert.equal(row.prizes.reduce((a, b) => a + b, 0), buyIn * row.multiplier);
    }
  }
});

test('every ticket boundary maps to its row; unresolved values stay null', () => {
  for (const buyIn of SPIN_STAKES) {
    let start = 0;
    for (const [multiplier, frequency] of EXPECTED) {
      for (const ticket of [start, start + frequency - 1]) {
        const outcome = spinOutcome(buyIn, ticket);
        assert.equal(outcome.multiplier, multiplier, `ticket ${ticket}`);
        assert.equal(outcome.buyIn, buyIn);
        assert.equal(outcome.seats, 3);
        assert.equal(outcome.prizes.reduce((a, b) => a + b, 0), outcome.prizePool);
        assert.equal(outcome.startingChips, null);
        assert.equal(outcome.timeBankCards, null);
      }
      start += frequency;
    }
    assert.equal(start, SPIN_TICKET_TOTAL);
    assert.equal(spinOutcome(buyIn, SPIN_TICKET_TOTAL - 1).multiplier, 2);
  }
});

test('invalid tickets and unobserved stakes are rejected', () => {
  for (const ticket of [-1, 100000000, 1.5, '5', null, undefined, NaN, Infinity]) {
    assert.throws(() => spinOutcome(5000, ticket), RangeError, String(ticket));
  }
  for (const stake of [25, 0, 5001, 15000, 30000, '5000', null, -5000]) {
    assert.throws(() => spinPayouts(stake), RangeError, String(stake));
    assert.throws(() => spinOutcome(stake, 0), RangeError, String(stake));
  }
});

test('spinBlindLevel: minute rows step on the clock, not hands', () => {
  assert.equal(spinBlindLevel(2, { startedAt: 1000, now: 60999, completedHands: 100 }).level, 1);
  assert.equal(spinBlindLevel(2, { startedAt: 1000, now: 61000, completedHands: 0 }).level, 2);
  assert.equal(spinBlindLevel(3, { startedAt: 0, now: 119999, completedHands: 999 }).level, 1);
  assert.equal(spinBlindLevel(3, clock({ now: 120000 })).level, 2);
  assert.equal(spinBlindLevel(4, clock({ now: 119999 })).level, 1);
  assert.equal(spinBlindLevel(4, clock({ now: 120000 })).level, 2);
  assert.equal(spinBlindLevel(5, clock({ now: 179999 })).level, 1);
  assert.equal(spinBlindLevel(5, clock({ now: 180000 })).level, 2);
  assert.equal(spinBlindLevel(2, { startedAt: 1000, now: 0, completedHands: 0 }).level, 1, 'clock skew clamps to 0');
});

test('spinBlindLevel: hand rows step on completed hands, not the clock', () => {
  for (const [multiplier, hands] of [[10, 10], [50, 15], [100, 15], [20000, 20]]) {
    const before = spinBlindLevel(multiplier, clock({ now: 99999999, completedHands: hands - 1 }));
    assert.equal(before.level, 1);
    assert.deepEqual([before.unit, before.interval], ['hands', hands]);
    assert.equal(spinBlindLevel(multiplier, clock({ completedHands: hands })).level, 2);
  }
});

test('spinBlindLevel: 26 levels from the verified ladder, then capped', () => {
  assert.equal(spinSmallBlinds.length, 26);
  for (let i = 0; i < 26; i++) {
    const level = spinBlindLevel(2, clock({ now: i * 60000 }));
    assert.deepEqual([level.level, level.smallBlind, level.bigBlind], [i + 1, spinSmallBlinds[i], spinSmallBlinds[i] * 2]);
  }
  const capped = spinBlindLevel(20000, clock({ completedHands: 99999 }));
  assert.deepEqual([capped.level, capped.bigBlind], [26, 3000]);
});

test('spinBlindLevel rejects unobserved multipliers and bad clocks', () => {
  for (const multiplier of [40, 25, 1, '2']) {
    assert.throws(() => spinBlindLevel(multiplier, clock()), RangeError);
  }
  for (const bad of [{ completedHands: 0.5 }, { now: -1 }, { startedAt: '0' }, { now: undefined }]) {
    assert.throws(() => spinBlindLevel(2, clock(bad)), RangeError, JSON.stringify(bad));
  }
  assert.throws(() => spinBlindLevel(2), RangeError);
});

test('module tables are frozen and payouts return fresh objects', () => {
  assert.ok(Object.isFrozen(spinSmallBlinds) && Object.isFrozen(SPIN_MULTIPLIERS) && Object.isFrozen(SPIN_STAKES));
  const first = spinPayouts(5000);
  first[0].prizes[0] = 0;
  assert.equal(spinPayouts(5000)[0].prizes[0], 50000000);
});

test('prizeAmounts gives the remainder to the largest fractions and validates shares', () => {
  assert.deepEqual(prizeAmounts(10, [50, 30, 20]), [5, 3, 2]);
  assert.deepEqual(prizeAmounts(7, [60, 30, 10]), [4, 2, 1]);
  assert.deepEqual(prizeAmounts(1, [50, 30, 20]), [1, 0, 0]);
  for (const [pool, shares] of [[-1, [100]], [1.5, [100]], [10, [50, 40]], [10, []], [10, [0, 100]], [10, 'x']]) {
    assert.throws(() => prizeAmounts(pool, shares), RangeError);
  }
});
