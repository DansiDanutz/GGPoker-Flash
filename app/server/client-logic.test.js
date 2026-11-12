// The table UI's pure logic lives in TypeScript; Node strips the types so it can be tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { betLimits, potFractionTarget, sizingPresets, potOdds } from '../src/game/betting.ts';
import { betUnitOf, enterBetRequest, normalizeBettingOptions } from '../src/lib/tablePrefs.ts';
import { potChipLayout, shuffleFramePosition } from '../src/game/potChips.ts';
import { cardOrdinal, squeezeDragFrame, squeezeWheelFrame } from '../src/game/squeeze.ts';
import { showdownComplete, showdownPlan } from '../src/game/showdown.ts';
import { bestHand } from '../src/game/eval.ts';

const ctx = (over = {}) => ({
  pot: 300, currentBet: 0, minRaise: 100, bb: 100, myBet: 0, myStack: 5000, maxRaiseTo: 0, street: 'flop', ...over,
});

test('bet limits: minimum raise, all-in ceiling and the price to call', () => {
  const facing = betLimits(ctx({ pot: 700, currentBet: 400, minRaise: 300, myBet: 100 }));
  assert.deepEqual(facing, { toCall: 300, minTo: 700, maxTo: 5100, allInTo: 5100, canRaise: true });
  const short = betLimits(ctx({ currentBet: 400, minRaise: 300, myStack: 250 }));
  assert.equal(short.toCall, 250, 'a call is capped by the stack');
  assert.equal(short.canRaise, false);
});

test('a pot-sized raise calls first and then raises by the pot', () => {
  // 600 in the middle including a 200 bet: call 200, pot becomes 800, raise to 200 + 800.
  assert.equal(potFractionTarget(ctx({ pot: 600, currentBet: 200, minRaise: 200 }), 1), 1000);
  assert.equal(potFractionTarget(ctx({ pot: 300 }), 0.5), 150);
  assert.equal(potFractionTarget(ctx({ pot: 300, myStack: 120 }), 1), 120, 'never above the stack');
  assert.equal(potFractionTarget(ctx({ pot: 30 }), 0.5), 100, 'never below the minimum bet');
});

test('pot-limit ceiling from the server caps every size', () => {
  const plo = ctx({ pot: 150, currentBet: 100, myBet: 50, maxRaiseTo: 300, street: 'preflop' });
  assert.equal(betLimits(plo).maxTo, 300);
  for (const preset of sizingPresets(plo)) assert.ok(preset.target <= 300);
});

test('presets are big-blind multiples for an unopened pot and pot fractions otherwise', () => {
  const open = sizingPresets(ctx({ pot: 150, currentBet: 100, myBet: 0, street: 'preflop' }));
  assert.deepEqual(open.map((p) => p.label), ['2.5x', '3x', '4x']);
  assert.deepEqual(open.map((p) => p.target), [250, 300, 400]);
  const post = sizingPresets(ctx({ pot: 900 }));
  assert.deepEqual(post.map((p) => p.label), ['33%', '50%', '75%', 'Pot']);
  assert.deepEqual(post.map((p) => p.target), [300, 450, 675, 900]);
  assert.deepEqual(sizingPresets(ctx({ pot: 900 }), 100).map((p) => p.target), [300, 500, 700, 900], 'rounded to the chip step');
});

test('pot odds', () => {
  assert.deepEqual(potOdds(900, 300), { ratio: 3, equityNeeded: 0.25 });
  assert.equal(potOdds(900, 0), null);
});

test('client hand label follows short-deck rankings', () => {
  const hole = ['Ah', 'Kh'];
  const board = ['9h', '7h', '6h', 'Kd', 'Kc'];
  assert.equal(bestHand(hole, board, false, true).name, 'Flush');
  assert.equal(bestHand(['As', '6d'], ['7c', '8h', '9s', '2d', '2c'], false, true).name, 'Straight');
  assert.equal(bestHand(['As', '6d'], ['7c', '8h', '9s', 'Qd', 'Jc'], false, false).name, 'High Card');
});

test('Enter bets the amount on screen, optionally asking first', () => {
  assert.deepEqual(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 450, allInTo: 5000 }),
    { action: 'raise', amount: 450, confirm: false });
  assert.deepEqual(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 450, allInTo: 5000, confirm: true }),
    { action: 'raise', amount: 450, confirm: true }, 'Always confirm carries the flag through');
  assert.deepEqual(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 5000, allInTo: 5000 }),
    { action: 'allin', amount: 5000, confirm: false }, 'a bet at the ceiling is an all-in');
  assert.equal(enterBetRequest({ myTurn: false, canRaise: true, raiseTo: 450, allInTo: 5000 }), null);
  assert.equal(enterBetRequest({ myTurn: true, canRaise: false, raiseTo: 450, allInTo: 5000 }), null);
  assert.equal(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 0, allInTo: 5000 }), null);
});

test('the pot pile uses native denominations with per-column caps', () => {
  assert.deepEqual(potChipLayout(0, 200), [], 'an empty pot shows no chips');
  assert.deepEqual(potChipLayout(2000, 200), [{ denom: 5, count: 2 }], '10 BB is two 5-BB chips');
  assert.deepEqual(potChipLayout(24000, 200), [{ denom: 5, count: 4 }, { denom: 100, count: 1 }], '120 BB groups by denomination');
  assert.deepEqual(potChipLayout(180000, 200), [{ denom: 100, count: 9 }], 'a 900 BB pot caps the column');
  assert.deepEqual(potChipLayout(200000, 200), [{ denom: 25, count: 4 }, { denom: 100, count: 9 }], 'overflow uses the next denomination');
  for (const col of potChipLayout(10000000, 200)) assert.ok(col.count <= 9);
  assert.deepEqual(shuffleFramePosition(1), { x: 0, y: 0 });
  assert.ok(Math.abs(shuffleFramePosition(15).x - 93.3333) < 0.01);
  assert.deepEqual(shuffleFramePosition(16), { x: 100, y: 0 });
  assert.equal(shuffleFramePosition(17).x, 0);
  assert.ok(Math.abs(shuffleFramePosition(17).y - 6.6667) < 0.01);
});

test('betting options follow the native defaults and reject junk', () => {
  assert.deepEqual(normalizeBettingOptions(null), { wheelUp: 'increase', unit: 'bb', confirm: 'always' });
  assert.deepEqual(
    normalizeBettingOptions({ wheelUp: 'decrease', unit: 'sb', confirm: 'never' }),
    { wheelUp: 'decrease', unit: 'sb', confirm: 'never' },
  );
  assert.deepEqual(
    normalizeBettingOptions({ wheelUp: 'sideways', unit: 'usd', confirm: 'maybe' }),
    { wheelUp: 'increase', unit: 'bb', confirm: 'always' },
    'unknown values fall back to the native defaults',
  );
  assert.equal(betUnitOf({ unit: 'bb' }, 50, 100), 100);
  assert.equal(betUnitOf({ unit: 'sb' }, 50, 100), 50);
  assert.equal(betUnitOf({ unit: 'bb' }, 0, 0), 1, 'never returns a zero step');
});

test('card squeeze frames follow the native wheel and drag curves', () => {
  assert.equal(cardOrdinal('2c'), 0);
  assert.equal(cardOrdinal('As'), 51);
  assert.throws(() => cardOrdinal('1x'));
  assert.equal(squeezeWheelFrame(0, 1), 6, 'one wheel notch peels six frames');
  assert.equal(squeezeWheelFrame(58, 1), 60);
  assert.equal(squeezeWheelFrame(30, 0), 30);
  assert.equal(squeezeDragFrame(0, 400, 0), 60, 'a 400px drag fully opens');
  assert.ok(squeezeDragFrame(0, 100, 0) > 0 && squeezeDragFrame(0, 100, 0) < 60);
  assert.equal(squeezeDragFrame(50, 10, 0), 50, 'dragging back never re-closes the peel');
});

test('showdown reveals run in seat order and finish before the badge', () => {
  assert.deepEqual(showdownPlan([5, 1, 3]), [
    { seat: 1, at: 1067 },
    { seat: 3, at: 1733 },
    { seat: 5, at: 2400 },
  ]);
  assert.equal(showdownComplete([5, 1, 3]), 2700);
  assert.deepEqual(showdownPlan([]), []);
  assert.equal(showdownComplete([]), 0);
});
