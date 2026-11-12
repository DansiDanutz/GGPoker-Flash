import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleHandError, STALE_ACTION_ERROR } from './action-version.js';

const table = { handNo: 12 };

test('an action without a hand number is accepted (older clients)', () => {
  assert.equal(staleHandError(table, { type: 'action', action: 'fold' }), null);
  assert.equal(staleHandError(table, { type: 'action', action: 'fold', handNo: null }), null);
});

test('an action for the current hand is accepted', () => {
  assert.equal(staleHandError(table, { handNo: 12 }), null);
  assert.equal(staleHandError(table, { handNo: '12' }), null);
});

test('an action sent for an earlier (or any other) hand is rejected', () => {
  assert.equal(staleHandError(table, { handNo: 11 }), STALE_ACTION_ERROR);
  assert.equal(staleHandError(table, { handNo: 13 }), STALE_ACTION_ERROR);
  assert.equal(staleHandError(table, { handNo: 'abc' }), STALE_ACTION_ERROR);
  assert.match(STALE_ACTION_ERROR, /hand/i);
});
