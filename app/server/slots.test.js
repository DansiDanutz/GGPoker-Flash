import test from 'node:test';
import assert from 'node:assert/strict';
import { spinSlots, evaluateLine, PAYTABLE } from './slots.js';

// mulberry32: a small seeded generator good enough for a return-to-player estimate.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('wilds substitute for the line symbol instead of matching everything', () => {
  assert.deepEqual(evaluateLine(['wild', 'cherry', 'cherry', 'bell', 'star']), { symbol: 'cherry', count: 3, multiplier: PAYTABLE.cherry[0] });
  assert.equal(evaluateLine(['wild', 'cherry', 'bell', 'star', 'seven']), null, 'a leading wild no longer wins on its own');
  assert.equal(evaluateLine(['bell', 'bell', 'star', 'bell', 'bell']), null);
  assert.equal(evaluateLine(['wild', 'wild', 'wild', 'wild', 'wild']).multiplier, PAYTABLE.wild[2]);
  assert.equal(evaluateLine(['seven', 'wild', 'seven', 'seven', 'lemon']).count, 4);
});

test('slots return less than they take in over the long run', () => {
  const random = seeded(20261111);
  const bet = 1000;
  const spins = 600_000;
  let won = 0;
  for (let i = 0; i < spins; i++) won += spinSlots(bet, random).win;
  const rtp = won / (bet * spins);
  assert.ok(rtp > 0.9 && rtp < 0.99, `return to player was ${rtp.toFixed(4)}`);
});

test('a spin reports a 5x3 grid and line wins that add up', () => {
  const { grid, lines, win } = spinSlots(1000, seeded(7));
  assert.equal(grid.length, 5);
  assert.ok(grid.every((reel) => reel.length === 3));
  assert.equal(win, lines.reduce((a, l) => a + l.amount, 0));
});
