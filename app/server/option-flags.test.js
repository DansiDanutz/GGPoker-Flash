// Socket option messages carry real booleans only (spec rule 11.2): the string "false"
// must never switch an option on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidOptionFlag } from './option-flags.js';

test('boolean options accept only true or false', () => {
  assert.equal(invalidOptionFlag({ waitForBlinds: true, autoMuck: false }), null);
  assert.equal(invalidOptionFlag({ waitForBlinds: 'false' }), 'waitForBlinds');
  assert.equal(invalidOptionFlag({ autoStraddle: 1 }), 'autoStraddle');
  assert.equal(invalidOptionFlag({ leaveAfterHand: 'yes' }), 'leaveAfterHand');
});

test('absent options and non-flag fields are not checked here', () => {
  assert.equal(invalidOptionFlag({ type: 'option', tableId: 'x', runPref: 2, autoReduceBB: 40 }), null);
  assert.equal(invalidOptionFlag({ insurance: null }), null, 'null means not sent');
});
