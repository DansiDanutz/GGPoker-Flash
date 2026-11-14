// Sliding the Dan avatar across the credit pill opens the news card; a short drag snaps back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { swipeOffset, swipeOpens, SWIPE_TAP_PX } from '../src/lib/creator.ts';

test('the avatar only slides right and stops at the end of the pill', () => {
  assert.equal(swipeOffset(-30, 200), 0);
  assert.equal(swipeOffset(80, 200), 80);
  assert.equal(swipeOffset(400, 200), 200);
});

test('a slide past half the track opens the news; a short one does not', () => {
  assert.equal(swipeOpens(120, 200), true);
  assert.equal(swipeOpens(100, 200), true);
  assert.equal(swipeOpens(60, 200), false);
  assert.equal(swipeOpens(50, 0), false);
});

test('a tiny movement still counts as a tap', () => {
  assert.ok(SWIPE_TAP_PX > 0 && SWIPE_TAP_PX <= 10);
});

test('the credit pill wires pointer dragging and shows a swipe hint', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '../src/components/brand/CreatorCredit.tsx'), 'utf8');
  assert.match(src, /onPointerDown/);
  assert.match(src, /onPointerUp/);
  assert.match(src, /creator-credit-swipe/);
});
