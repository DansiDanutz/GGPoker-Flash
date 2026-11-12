// Native StraddleDecideView.update: "Straddle to" only when the amount is below the all-in
// amount (balance + committed); "All-in to" always; the TIME badge counts whole seconds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { straddlePrompt } from '../src/game/straddlePrompt.ts';

test('no prompt without an ask', () => {
  assert.equal(straddlePrompt(null, 0), null);
});

test('both buttons when the stack covers the straddle', () => {
  const p = straddlePrompt({ amount: 8, allInTo: 88, canStraddle: true, endsAt: 5000 }, 1200);
  assert.deepEqual(p, { amount: 8, allInTo: 88, showStraddle: true, secondsLeft: 4 });
});

test('a short stack only sees All-in', () => {
  const p = straddlePrompt({ amount: 8, allInTo: 6, canStraddle: false, endsAt: 5000 }, 0);
  assert.equal(p.showStraddle, false);
});

test('the countdown never goes below zero', () => {
  assert.equal(straddlePrompt({ amount: 4, allInTo: 50, canStraddle: true, endsAt: 1000 }, 9000).secondsLeft, 0);
});
