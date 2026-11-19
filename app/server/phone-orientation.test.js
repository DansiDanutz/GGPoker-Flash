import test from 'node:test';
import assert from 'node:assert/strict';
import { needsPortrait } from '../src/lib/phoneOrientation.ts';

test('phone landscape is blocked in both rotation directions', () => {
  for (const type of ['landscape-primary', 'landscape-secondary']) {
    assert.equal(needsPortrait({ width: 832, height: 384, orientation: { type } }, true), true);
  }
});
test('portrait remains usable with a keyboard reducing the viewport height', () => {
  assert.equal(needsPortrait({ width: 384, height: 832, orientation: { type: 'portrait-primary' } }, true), false);
});
test('desktop pointers and large touch screens remain wide', () => {
  assert.equal(needsPortrait({ width: 900, height: 640, orientation: { type: 'landscape-primary' } }, false), false);
  assert.equal(needsPortrait({ width: 1920, height: 1080, orientation: { type: 'landscape-primary' } }, true), false);
});
test('fallback uses physical screen dimensions when orientation API is unavailable', () => {
  assert.equal(needsPortrait({ width: 832, height: 384 }, true), true);
  assert.equal(needsPortrait({ width: 384, height: 832 }, true), false);
});
