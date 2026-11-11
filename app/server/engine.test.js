import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, score5, compareScores, bestHoldem, bestOmaha } from './poker.js';
import { PokerTable } from './table.js';

const C = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });

function player(id, nick, stack, totalBet, cards, folded = false) {
  return {
    id, nick, avatar: '', stack, isBot: false, sittingOut: false, disconnected: false,
    inHand: true, folded, allIn: false, bet: 0, totalBet, cards, acted: true,
    reveal: false, lastAction: null, winAmount: 0, seat: 0, timeBank: 30,
    joinedAt: Date.now(), handsPlayed: 0, won: 0,
  };
}

function tableWith(players, cfg = {}) {
  const t = new PokerTable({ id: 'test', name: 'Test', game: 'holdem', sb: 50, bb: 100, seats: players.length, min_buyin: 100, max_buyin: 100000, ...cfg });
  players.forEach((p, i) => { p.seat = i; t.seats[i].player = p; });
  t.pot = players.reduce((a, p) => a + p.totalBet, 0);
  t.street = 'river';
  t.handNo = 1;
  return t;
}

test('deck has 52 unique cards, short deck has 36', () => {
  const d = makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => c.r + c.s)).size, 52);
  assert.equal(makeDeck(true).length, 36);
});

test('hand ranking is ordered correctly', () => {
  const royal = score5(['As', 'Ks', 'Qs', 'Js', 'Ts'].map(C));
  const quads = score5(['Ah', 'Ad', 'Ac', 'As', 'Kd'].map(C));
  const full = score5(['Kh', 'Kd', 'Kc', '2s', '2d'].map(C));
  const flush = score5(['Ah', 'Th', '7h', '4h', '2h'].map(C));
  const straight = score5(['9s', '8d', '7c', '6h', '5s'].map(C));
  const wheel = score5(['As', '2d', '3c', '4h', '5s'].map(C));
  assert.ok(compareScores(royal, quads) > 0);
  assert.ok(compareScores(quads, full) > 0);
  assert.ok(compareScores(full, flush) > 0);
  assert.ok(compareScores(flush, straight) > 0);
  assert.ok(compareScores(straight, wheel) > 0);
});

test('bestHoldem selects the best five of seven', () => {
  const best = bestHoldem(['As', 'Ks'].map(C), ['Qs', 'Js', 'Ts', '2d', '3c'].map(C));
  assert.equal(best.name, 'Royal Flush');
});

test('bestOmaha uses exactly two hole cards and three board cards', () => {
  const best = bestOmaha(['As', 'Ks', '2d', '3c'].map(C), ['Qs', 'Js', 'Ts', '9d', '8c'].map(C));
  assert.equal(best.name, 'Royal Flush');
  const noFalseRoyal = bestOmaha(['As', '2d', '3c', '4h'].map(C), ['Ks', 'Qs', 'Js', 'Ts', '9d'].map(C));
  assert.notEqual(noFalseRoyal.name, 'Royal Flush');
});

test('rake is floored at 5% and capped by rakeCap (default 300)', () => {
  const t = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1 });
  assert.equal(t.computeRake(1000), 50);
  assert.equal(t.computeRake(1010), 50);
  assert.equal(t.computeRake(10000), 300);
  const capped = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1, rakeCap: 120 });
  assert.equal(capped.computeRake(10000), 120);
  const high = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1, bb: 2000 });
  assert.equal(high.computeRake(100000), 300);
  const zero = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1, rakeCap: 0 });
  assert.equal(zero.computeRake(10000), 300);
});

test('showdown builds side pots and conserves chips', () => {
  const p1 = player(1, 'Short', 1000, 300, ['As', 'Ks'].map(C));
  const p2 = player(2, 'Big', 1000, 1000, ['Ah', 'Ad'].map(C));
  const p3 = player(3, 'Folded', 1000, 300, ['2c', '3c'].map(C), true);
  const t = tableWith([p1, p2, p3]);
  t.board = ['Qs', 'Js', 'Ts', '2d', '3c'].map(C);
  t.doShowdown();
  // Main pot 900 minus 80 rake goes to the royal flush; the 700 side pot returns to the only player who funded it.
  assert.equal(p1.stack, 1820);
  assert.equal(p2.stack, 1700);
  assert.equal(p3.stack, 1000);
  assert.equal(t.rake, 80);
  assert.equal(p1.stack + p2.stack + p3.stack + t.rake, 3000 + 300 + 1000 + 300);
});

test('uncontested pot is raked and awarded to the last player', () => {
  const p1 = player(1, 'Winner', 800, 200, []);
  const p2 = player(2, 'Folder', 800, 200, [], true);
  const t = tableWith([p1, p2]);
  t.pot = 400;
  t.finishByFold(t.seats[0]);
  assert.equal(t.rake, 20);
  assert.equal(p1.stack, 1180);
  assert.equal(p1.stack + p2.stack + t.rake, 2000);
});

test('tournament winner receives half the prize pool exactly once and fires the hook once', () => {
  let paid = 0;
  let ends = 0;
  const p = player(1, 'Winner', 1000, 0, []);
  const t = tableWith([p], { seats: 1, tournament: { prizePool: 3000 } });
  t.hooks = {
    onTournamentEnd: () => { ends++; paid++; },
    onHandComplete: () => { throw new Error('should not fire'); },
  };
  t.awardTournamentWinner();
  assert.equal(t.tournament.winner.prize, 1500);
  assert.equal(p.stack, 2500);
  assert.equal(paid, 1);
  assert.equal(ends, 1);
});


test('places 2 and 3 are paid 30% and 20%, then the winner takes 50%', () => {
  const p1 = player(1, 'Winner', 1000, 0, []);
  const p2 = player(2, 'Second', 0, 0, []);
  const p3 = player(3, 'Third', 0, 0, []);
  const t = tableWith([p1, p2, p3], { seats: 3, tournament: { prizePool: 3000 } });
  t.street = 'ended';
  t.nextHandAt = 1;
  const payouts = [];
  let endPrize = 0;
  t.hooks = {
    onTournamentPayout: (_table, p) => payouts.push(p),
    onTournamentEnd: (_table, w) => { endPrize = w.prize; },
  };
  t.tick(2);
  assert.deepEqual(payouts.map((p) => [p.place, p.payout]), [[2, 900], [3, 600]]);
  assert.equal(endPrize, 1500);
});


test('elimination bust fires onSeatBusted before the seat is cleared', () => {
  const p1 = player(1, 'Spin winner', 1000, 0, []);
  const p2 = player(2, 'Busted A', 0, 0, []);
  const p3 = player(3, 'Busted B', 0, 0, []);
  const t = tableWith([p1, p2, p3], { seats: 3, game: 'spingold' });
  t.street = 'ended';
  t.nextHandAt = 1;
  const busted = [];
  t.hooks = { onSeatBusted: (_table, p) => busted.push(p.id), onHandComplete: () => {} };
  t.tick(2);
  assert.deepEqual(busted.sort(), [2, 3]);
});


test('a throwing onSeatBusted hook still clears the busted seat', () => {
  const p1 = player(1, 'Winner', 1000, 0, []);
  const p2 = player(2, 'Busted', 0, 0, []);
  const p3 = player(3, 'Busted too', 0, 0, []);
  const t = tableWith([p1, p2, p3], { seats: 3, game: 'spingold' });
  t.street = 'ended';
  t.nextHandAt = 1;
  t.hooks = { onSeatBusted: () => { throw new Error('hook failed'); }, onHandComplete: () => {} };
  t.tick(2);
  assert.equal(t.seats[1].player, null);
  assert.equal(t.seats[2].player, null);
});


test('spin award reports the minted prize', () => {
  const p1 = player(1, 'Winner', 1000, 0, []);
  const p2 = player(2, 'Busted', 0, 0, []);
  const t = tableWith([p1, p2], { seats: 2, game: 'spingold' });
  t.spinPrize = 250;
  t.street = 'ended';
  t.nextHandAt = 1;
  let minted = 0;
  t.hooks = { onMint: (_table, kind, amount) => { if (kind === 'spin') minted += amount; }, onHandComplete: () => {} };
  t.tick(2);
  assert.equal(minted, 250);
});
