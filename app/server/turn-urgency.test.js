// Native PlayerTurnEffect3D (REA six-seat-turn-indicator / aof-turn-urgency): the turn glow
// blinks at a 500 ms half-period for every actor; only the viewer's OWN seat turns urgent
// (tint #ff7f7f, 200 ms half-period) in its final five seconds (`userOnly: true`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { URGENT_SECONDS, turnUrgencyClass } from '../src/game/turnClock.ts';

test('no class when nobody is acting or the clock is unknown', () => {
  assert.equal(turnUrgencyClass(null, false), '');
  assert.equal(turnUrgencyClass(undefined, true), '');
});

test('normal turn above the final five seconds', () => {
  assert.equal(turnUrgencyClass(URGENT_SECONDS + 1, true), '');
});

test('final five seconds: urgent only on the viewer\'s own seat', () => {
  assert.equal(URGENT_SECONDS, 5);
  assert.equal(turnUrgencyClass(3, true), ' urgent');
  assert.equal(turnUrgencyClass(0, true), ' urgent');
  assert.equal(turnUrgencyClass(5, false), '', 'opponents keep the normal glow');
  assert.equal(turnUrgencyClass(0, false), '');
});

import { TIME_BANK_SECONDS, timeBankOffered } from '../src/game/turnClock.ts';

test('time bank is offered only in the final ten seconds of the viewer\'s own turn', () => {
  // Native PlayerTimeBank3D: the button (and its hotkey) appear in the last 10 s.
  assert.equal(TIME_BANK_SECONDS, 10);
  assert.equal(timeBankOffered({ myTurn: true, secondsLeft: 10, used: false }), true);
  assert.equal(timeBankOffered({ myTurn: true, secondsLeft: 0, used: false }), true);
  assert.equal(timeBankOffered({ myTurn: true, secondsLeft: 11, used: false }), false);
  assert.equal(timeBankOffered({ myTurn: false, secondsLeft: 3, used: false }), false);
  assert.equal(timeBankOffered({ myTurn: true, secondsLeft: 3, used: true }), false, 'once per hand');
  assert.equal(timeBankOffered({ myTurn: true, secondsLeft: null, used: false }), false);
});
