// Antes are dead money (native: post the ante, then reset bets to 0 before the blinds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

function anteTable() {
  const t = new PokerTable({ id: 't', name: 't', game: 'holdem', seats: 3, sb: 1, bb: 2, ante: 1, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {}; t.botAct = () => {};
  t.nextHandAt = Date.now() + 1e9;
  for (let i = 0; i < 3; i++) t.sit({ id: 'p' + i, nick: 'p' + i }, i, 100);
  t.button = 2; t.nextHandAt = 0; t.startHand(); // button 0, SB 1, BB 2, p0 acts first
  return t;
}

test('the ante goes to the pot and does not count toward the bet to call', () => {
  const t = anteTable();
  const [p0, p1, p2] = t.seats.map((s) => s.player);
  assert.equal(t.pot, 3, 'three antes are already in the pot');
  assert.deepEqual([p0.bet, p1.bet, p2.bet], [0, 1, 2], 'only the blinds are live bets');
  assert.equal(t.actor, 'p0');
  assert.equal(t.currentBet - p0.bet, 2, 'first to act owes the full big blind');
  assert.deepEqual([p0.totalBet, p1.totalBet, p2.totalBet], [1, 2, 3], 'antes still count for side pots');
});

test('the small blind still owes one chip after an ante', () => {
  const t = anteTable();
  t.act('p0', 'call');
  const p1 = t.seats[1].player;
  assert.equal(t.actor, 'p1');
  assert.equal(t.currentBet - p1.bet, 1);
});
