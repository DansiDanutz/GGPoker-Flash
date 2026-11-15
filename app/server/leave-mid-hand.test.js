// Leaving mid-hand folds the hand: every chip the leaver put in stays in the pot (no free
// bluff by betting and then leaving), and the players left face no bet from a departed seat.
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

test('a leaver forfeits an unmatched bet; the players left face no bet from a departed seat', () => {
  const t = threeHanded();
  const { stack } = t.stand('A');
  assert.equal(stack, 400, 'A keeps only the chips behind; the 500 bet stays in the pot');
  assert.equal(t.currentBet, 0, 'the remaining players face no bet from a departed seat');
  assert.equal(t.minRaise, 10, 'the minimum bet falls back to the big blind');
});

test('a forfeited bet is won by the players left, and chips are conserved (EGM round 3)', () => {
  const t = new PokerTable({ id: 'f', name: 'f', game: 'holdem', seats: 3, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9;
  t.saveHand = () => {};
  t.sit({ id: 'A', nick: 'A' }, 0, 1000);
  t.sit({ id: 'B', nick: 'B' }, 1, 1000);
  t.sit({ id: 'C', nick: 'C' }, 2, 1000);
  t.button = 2; t.nextHandAt = 0; t.startHand(); // A button, B small blind, C big blind
  t.act('A', 'call'); t.act('B', 'call'); t.act('C', 'check');
  t.act('B', 'check'); t.act('C', 'check'); t.act('A', 'raise', 500); // flop: A bets 500
  const { stack } = t.stand('A');
  assert.equal(stack, 490);
  t.act('B', 'check'); t.act('C', 'check');
  while (t.street !== 'ended' && t.actor) t.act(t.actor, 'check');
  const b = t.seats[1].player.stack, c = t.seats[2].player.stack;
  assert.equal(stack + b + c, 3000, 'no chip is created or lost');
  assert.ok(b + c === 2510, `B and C share the 30 pot plus A's dead 500 (got ${b + c})`);
});

test('the short all-in only wins the pot it covered; chips are conserved', () => {
  const t = threeHanded();
  const { stack: leaverStack } = t.stand('A');
  // B and C have nobody left to bet against: they are asked how many times to run it, and B says once.
  assert.ok(t.runRound, 'the run-it choice is open');
  t.decideRuns('B', 1);
  assert.equal(t.street, 'ended');
  const b = t.seats[1].player.stack, c = t.seats[2].player.stack;
  assert.equal(leaverStack + b + c, 2050, 'no chip is created or lost');
  // C wins nothing, the whole 150 main pot, or half of it on a tie with B.
  assert.ok(c === 0 || c === 75 || c === 150, `C covers 50 x 3 = 150 at most, got ${c}`);
});

function headsUpAllIn() {
  const t = new PokerTable({ id: 'h', name: 'h', game: 'holdem', seats: 2, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9;
  t.saveHand = () => {};
  t.sit({ id: 'A', nick: 'A' }, 0, 1000);
  t.sit({ id: 'B', nick: 'B' }, 1, 1000);
  t.button = 1; t.nextHandAt = 0; t.startHand();
  t.act(t.actor, 'allin');
  t.act(t.actor, 'call');
  return t;
}

test('leaving during the run-it choice settles the pot once, and a late choice changes nothing', () => {
  const t = headsUpAllIn();
  assert.ok(t.runRound, 'both all-in: the run-it choice is open');
  const { stack: aStack } = t.stand('A');
  assert.equal(t.street, 'ended');
  assert.equal(t.runRound, null, 'the choice closes with the hand');
  const bAfterFold = t.seats[1].player.stack;
  assert.equal(aStack + bAfterFold, 2000);
  assert.equal(t.decideRuns('B', 1).ok, false, 'nothing left to decide');
  t.closeRunRound();
  assert.equal(t.seats[1].player.stack, bAfterFold, 'the pot is never paid twice');
});

test('a disconnected all-in player with no saved choice means the board runs once', () => {
  const t = new PokerTable({ id: 'd', name: 'd', game: 'holdem', seats: 2, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9;
  t.saveHand = () => {};
  t.sit({ id: 'A', nick: 'A' }, 0, 1000);
  t.sit({ id: 'B', nick: 'B' }, 1, 1000);
  t.button = 1; t.nextHandAt = 0; t.startHand();
  t.seats[1].player.disconnected = true;
  t.act(t.actor, 'allin');
  t.act(t.actor, 'call');
  assert.equal(t.runRound, null, 'nobody asks the present player alone');
  assert.equal(t.street, 'ended');
});
