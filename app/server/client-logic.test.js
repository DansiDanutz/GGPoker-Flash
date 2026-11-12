// The table UI's pure logic lives in TypeScript; Node strips the types so it can be tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { betLimits, potFractionTarget, sizingPresets, potOdds } from '../src/game/betting.ts';
import { enterBetRequest } from '../src/lib/tablePrefs.ts';
import { potChipTiers } from '../src/game/potChips.ts';
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

test('the middle chip pile grows with the pot and caps at twelve chips', () => {
  assert.deepEqual(potChipTiers(0, 100), [], 'an empty pot shows no chips');
  assert.equal(potChipTiers(50, 100).length, 3, 'a small pot still looks like a pile');
  assert.equal(potChipTiers(400, 100).length, 4, 'a chip per big blind');
  assert.ok(potChipTiers(2000, 100).length > potChipTiers(1000, 100).length, 'a bigger pot shows more chips');
  assert.equal(potChipTiers(100000, 100).length, 12, 'the pile is capped');
  assert.deepEqual(potChipTiers(5000, 100).slice(0, 4), [0, 0, 0, 0]);
  assert.deepEqual(potChipTiers(5000, 100).slice(4, 8), [1, 1, 1, 1], 'bigger denominations join later');
  assert.deepEqual(potChipTiers(9000, 100), [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
});
