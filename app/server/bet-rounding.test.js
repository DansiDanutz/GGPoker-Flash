// Native shortcut rounding (REA: BettingInfo / OptionBettingPage, via the Codex clone):
// normal pot-fraction shortcuts ceil up to the small blind, or to the minimum chip unit
// with "Don't round to nearest blind"; opening, Pot and Max bypass rounding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ceilToUnit, sizingPresets } from '../src/game/betting.ts';
import { betTarget, normalizeBettingOptions, shortcutRoundUnit } from '../src/lib/tablePrefs.ts';

const flop = { pot: 1000, currentBet: 0, minRaise: 100, bb: 100, myBet: 0, myStack: 10000, maxRaiseTo: 0, street: 'flop' };

test('ceilToUnit rounds up, never down, and ignores a bad unit', () => {
  assert.equal(ceilToUnit(333.4, 50), 350);
  assert.equal(ceilToUnit(350, 50), 350);
  assert.equal(ceilToUnit(333.4, 1), 334);
  assert.equal(ceilToUnit(333.4, 0), 334);
});

test('postflop fractions ceil to the rounding unit; Pot is exact', () => {
  const presets = Object.fromEntries(sizingPresets(flop, 50).map((p) => [p.label, p.target]));
  assert.equal(presets['33%'], 350, '333.3 ceils to 350, not nearest 350/300');
  assert.equal(presets['75%'], 750);
  assert.equal(presets.Pot, 1000);
  const precise = Object.fromEntries(sizingPresets(flop, 1).map((p) => [p.label, p.target]));
  assert.equal(precise['33%'], 334);
});

test('opening multiples bypass rounding', () => {
  const pre = { ...flop, pot: 150, currentBet: 100, street: 'preflop' };
  assert.deepEqual(sizingPresets(pre, 50).map((p) => p.target), [250, 300, 400]);
});

test('configured percentage shortcuts ceil before the legal clamp', () => {
  const state = { pot: 1000, currentBet: 0, bb: 100 };
  assert.equal(betTarget(33, false, state, 0, 100, 10000, 50), 350);
  assert.equal(betTarget(33, false, state, 0, 100, 10000, 1), 330);
  assert.equal(betTarget('pot', false, state, 0, 100, 10000, 50), 1000);
  assert.equal(betTarget(99, false, state, 0, 100, 900, 50), 900, 'cap still applies after rounding');
  assert.equal(betTarget(2.5, true, state, 0, 100, 10000, 50), 250, 'opening bypasses');
});

test('rounding unit follows the Don\'t round option', () => {
  assert.equal(shortcutRoundUnit({ dontRound: false }, 50), 50);
  assert.equal(shortcutRoundUnit({ dontRound: true }, 50), 1);
  assert.equal(shortcutRoundUnit({ dontRound: false }, 0), 1);
  assert.equal(normalizeBettingOptions({}).dontRound, false);
  assert.equal(normalizeBettingOptions({ dontRound: true }).dontRound, true);
  assert.equal(normalizeBettingOptions({ dontRound: 'yes' }).dontRound, false);
});
