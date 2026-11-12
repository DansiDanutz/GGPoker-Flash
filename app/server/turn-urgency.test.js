// Native PlayerTurnEffect3D: normal 0.5 s glow; final five seconds turn urgent, and the
// seated player's own seat pulses at 0.2 s (ported via the Codex clone's REA notes).
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

test('final five seconds: urgent for everyone, faster for the own seat', () => {
  assert.equal(URGENT_SECONDS, 5);
  assert.equal(turnUrgencyClass(5, false), ' urgent');
  assert.equal(turnUrgencyClass(0, false), ' urgent');
  assert.equal(turnUrgencyClass(3, true), ' urgent urgent-me');
});
