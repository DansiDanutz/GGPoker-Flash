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
