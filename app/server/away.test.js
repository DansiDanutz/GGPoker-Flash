// What a dropped connection changes, and what a reconnect puts back (spec rules 8.1, 9.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { awayChanges, shouldSitBackIn } from './away.js';

const seat = (over = {}) => ({ inHand: false, folded: true, sittingOut: false, sitOutNextHand: false, sitOutAll: false, ...over });

test('a player holding a live hand keeps it on the clock: sat out only from the next hand', () => {
  const live = seat({ inHand: true, folded: false });
  assert.deepEqual(awayChanges(live, { live: true }).sittingOut, undefined);
  assert.equal(awayChanges(live, { live: true }).sitOutNextHand, true);
});

test('a player not in a live hand is sat out at once', () => {
  assert.equal(awayChanges(seat(), { live: true }).sittingOut, true);
  assert.equal(awayChanges(seat({ inHand: true, folded: false }), { live: false }).sittingOut, true);
});

test('the changes remember what the player had chosen, without touching the seat', () => {
  const s = seat({ sitOutNextHand: true });
  const changes = awayChanges(s, { live: false });
  assert.deepEqual(changes.awayChoice, { sittingOut: false, sitOutNextHand: true, sitOutAll: false });
  assert.equal(s.away, undefined, 'awayChanges is pure');
});

test('a reconnect sits the player back in only if they had not chosen to sit out', () => {
  assert.equal(shouldSitBackIn({ sittingOut: false, sitOutNextHand: false, sitOutAll: false }), true);
  assert.equal(shouldSitBackIn({ sittingOut: false, sitOutNextHand: true, sitOutAll: false }), false);
  assert.equal(shouldSitBackIn({ sittingOut: true, sitOutNextHand: false, sitOutAll: false }), false);
  assert.equal(shouldSitBackIn(undefined), true, 'away for another reason (tournament start): sit back in');
});
