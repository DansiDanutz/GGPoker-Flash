// Auto top-up / auto rebuy (native auto-buy-in, REA top-up-verification): add chips between
// hands so the stack reaches the target, never past the table maximum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTopUpAmount } from '../src/lib/autoTopUp.ts';

const table = { min: 400, max: 2000, bb: 20 };

test('no top-up while the stack is at or above the trigger', () => {
  assert.equal(autoTopUpAmount({ ...table, stack: 1000, trigger: 1000, target: 2000 }), 0);
});

test('tops up to the target, never beyond the table maximum', () => {
  assert.equal(autoTopUpAmount({ ...table, stack: 1900, trigger: 1950, target: 2000 }), 100,
    'a small top-up is not forced up to the table minimum');
  assert.equal(autoTopUpAmount({ ...table, stack: 300, trigger: 500, target: 3000 }), 1700);
});

test('a busted stack is brought at least to the table minimum', () => {
  assert.equal(autoTopUpAmount({ ...table, stack: 0, trigger: 400, target: 200 }), 400);
});

test('amounts are whole chips', () => {
  assert.equal(autoTopUpAmount({ ...table, stack: 1234.5, trigger: 1500, target: 2000 }), 765);
});
