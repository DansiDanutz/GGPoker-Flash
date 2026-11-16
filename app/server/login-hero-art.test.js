// The login hero's gold sparks must rise from the trophy rim whatever size the hero panel is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverEmitter, DESKTOP_ART, PHONE_ART } from '../src/components/login/heroArt.ts';

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.5, `${label}: ${actual} != ${expected}`);

test('box with the art aspect ratio maps the rim straight to image fractions', () => {
  const e = coverEmitter(DESKTOP_ART, 512, 768);
  close(e.x, 0.48 * 512, 'x');
  close(e.y, 0.59 * 768, 'y');
  close(e.spread, 0.36 * 512, 'spread');
});

test('wide desktop panel crops the portrait art vertically, keeping the trophy in view', () => {
  const e = coverEmitter(DESKTOP_ART, 1000, 900);
  // Scaled to 1000x1500, shifted up by 72% of the 600px overflow.
  close(e.x, 480, 'x');
  close(e.y, -432 + 0.59 * 1500, 'y');
  assert.ok(e.y > 0 && e.y < 900);
});

test('phone hero crops the wide art sideways and keeps the rim right of centre', () => {
  const e = coverEmitter(PHONE_ART, 390, 327);
  assert.ok(e.x > 390 * 0.6 && e.x < 390, `rim x ${e.x} should sit in the right part of the hero`);
  assert.ok(e.y > 0 && e.y < 327);
});
