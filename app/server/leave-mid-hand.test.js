// Leaving mid-hand must not hand an unmatched bet to someone else (native splitPots: only
// matched chips can be won; the unmatched part returns to the player who bet it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

function threeHanded() {
  const t = new PokerTable({ id: 't', name: 't', game: 'holdem', seats: 3, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9;
  t.saveHand = () => {};
  t.sit({ id: 'A', nick: 'A' }, 0, 1000);
  t.sit({ id: 'B', nick: 'B' }, 1, 1000);
  t.sit({ id: 'C', nick: 'C' }, 2, 50);
  t.button = 2; t.nextHandAt = 0; t.startHand(); // A button, B small blind, C big blind
  t.act('A', 'raise', 100); t.act('B', 'call'); t.act('C', 'allin');
  t.act('B', 'check'); t.act('A', 'raise', 500); // flop: B checks, A bets 500
  return t;
}

test('a leaver takes back the unmatched part of their bet with their stack', () => {
  const t = threeHanded();
  const { stack } = t.stand('A');
  assert.equal(stack, 900, 'A keeps 400 behind plus the 500 nobody called');
  assert.equal(t.currentBet, 0, 'the remaining players face no bet from a departed seat');
});

test('the short all-in only wins the pot it covered; chips are conserved', () => {
  const t = threeHanded();
  const { stack: leaverStack } = t.stand('A');
  // B and C have nobody left to bet against, so the board runs out to a showdown.
  assert.equal(t.street, 'ended');
  const b = t.seats[1].player.stack, c = t.seats[2].player.stack;
  assert.equal(leaverStack + b + c, 2050, 'no chip is created or lost');
  // C wins nothing, the whole 150 main pot, or half of it on a tie with B.
  assert.ok(c === 0 || c === 75 || c === 150, `C covers 50 x 3 = 150 at most, got ${c}`);
});
