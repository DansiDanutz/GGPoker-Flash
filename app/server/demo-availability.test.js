import test from 'node:test';
import assert from 'node:assert/strict';
import { demoAvailability } from './demo-availability.js';

test('lobby verifies the demo password only when its stored hash changes', () => {
  let calls = 0;
  const available = demoAvailability((_password, hash) => { calls++; return hash === 'matching'; });
  assert.equal(available(undefined), false);
  assert.equal(available('matching'), true);
  assert.equal(available('matching'), true);
  assert.equal(calls, 1);
  assert.equal(available('changed'), false);
  assert.equal(available('changed'), false);
  assert.equal(calls, 2);
  assert.equal(available(undefined), false);
});
