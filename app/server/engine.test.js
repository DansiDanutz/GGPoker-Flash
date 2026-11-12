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
  t.board = ['Qs', 'Js', '2d'].map(C);
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


test('snapshots and events carry a table epoch and monotonic version', () => {
  const p1 = player(1, 'A', 1000, 0, []);
  const t = tableWith([p1], { seats: 1 });
  const before = t.snapshotFor();
  t.emit({ type: 'test' });
  const after = t.snapshotFor();
  assert.equal(before.tableEpoch, after.tableEpoch);
  assert.equal(after.tableVersion, before.tableVersion + 1);
});


test('PLO5 and PLO6 deal five and six hole cards', () => {
  const p1 = player(1, 'A', 1000, 0, []);
  const p2 = player(2, 'B', 1000, 0, []);
  const t5 = tableWith([p1, p2], { seats: 2, game: 'omaha5' });
  assert.equal(t5.omahaHole, 5);
  const t6 = tableWith([p1, p2], { seats: 2, game: 'omaha6' });
  assert.equal(t6.omahaHole, 6);
});


test('Flip & Go marks its first hand all-in', () => {
  const p1 = player(1, 'A', 10000, 0, []);
  const p2 = player(2, 'B', 10000, 0, []);
  const t = tableWith([p1, p2], { seats: 2, tournament: { prizePool: 100000, mode: 'FLIP' } });
  t.street = 'idle';
  t.handNo = 0;
  t.startHand();
  assert.equal(t.handNo, 1);
  assert.ok(t.street === 'ended' || t.street === 'showdown' || t.street === 'river');
});

test('Bounty and satellite tournament modes are wired', () => {
  const p1 = player(1, 'Winner', 5000, 0, []);
  const p2 = player(2, 'Busted', 0, 0, []);
  const p3 = player(3, 'Third', 0, 0, []);
  const t = tableWith([p1, p2, p3], { seats: 3, tournament: { prizePool: 10000, mode: 'BOUNTY', bounty: 500 } });
  t.lastAggressor = 1;
  t.street = 'ended';
  t.nextHandAt = 1;
  let paid = 0;
  t.hooks = { onBounty: (_t, info) => { paid += info.amount; }, onTournamentPayout: () => {}, onTournamentEnd: () => {} };
  t.tick(2);
  assert.equal(paid, 1000);

  const sat = tableWith([player(1, 'Seat', 100, 0, [])], { seats: 1, tournament: { prizePool: 0, mode: 'SATELLITE', ticket: 'Sunday Major' } });
  let ticket = null;
  sat.hooks = { onTournamentEnd: (table, w) => { ticket = w.ticket; } };
  sat.awardTournamentWinner();
  assert.equal(ticket, 'Sunday Major');
  assert.equal(sat.tournament.winner.prize, 0);
});


test('All-in or Fold asks each player and only accepts all-in or fold', () => {
  const p1 = player(1, 'A', 1000, 0, []);
  const p2 = player(2, 'B', 1000, 0, []);
  const t = tableWith([p1, p2], { seats: 2, game: 'aof' });
  t.street = 'idle';
  t.handNo = 0;
  t.startHand();
  assert.ok(t.actor);
  const first = t.actor;
  assert.equal(t.act(first, 'check').ok, false);
  assert.equal(t.act(first, 'allin').ok, true);
  const second = t.actor;
  if (second) t.act(second, 'fold');
  assert.ok(['showdown', 'ended', 'river'].includes(t.street));
});


test('straddle posts a third blind and opens action after it', () => {
  const p1 = player(1, 'A', 10000, 0, []);
  const p2 = player(2, 'B', 10000, 0, []);
  const p3 = player(3, 'C', 10000, 0, []);
  const t = tableWith([p1, p2, p3], { seats: 3, straddle: true });
  t.street = 'idle';
  t.handNo = 0;
  t.startHand();
  const straddler = [p1, p2, p3].find((p) => p.lastAction?.action === 'Straddle');
  assert.ok(straddler);
  assert.equal(straddler.totalBet, 200);
  assert.ok(t.actor);
});


test('run it twice deals two boards and splits the pot', () => {
  const p1 = player(1, 'A', 1000, 500, ['As', 'Ks'].map(C));
  const p2 = player(2, 'B', 1000, 500, ['2d', '7c'].map(C));
  const t = tableWith([p1, p2], { seats: 2 });
  t.pot = 1000;
  t.deck = makeDeck(false);
  t.runItTwice = true;
  t.runoutTwice();
  assert.equal(t.result.boards.length, 2);
  assert.equal(t.result.boards[0].length, 5);
  assert.equal(t.result.boards[1].length, 5);
  const paid = t.result.winners.reduce((a, w) => a + w.amount, 0);
  assert.equal(paid, 950);
});


test('Spin insurance charges a premium and arms a payout', () => {
  const p1 = player(1, 'A', 15000, 0, []);
  const p2 = player(2, 'B', 15000, 0, []);
  const t = tableWith([p1, p2], { seats: 2, game: 'spingold', min_buyin: 15000 });
  t.street = 'idle';
  assert.equal(t.setInsurance(1, true).ok, true);
  assert.equal(p1.stack, 14250);
  assert.equal(p1.insurance, true);
});

test('a Rush fold queues a cross-table move', () => {
  const p1 = player(1, 'A', 10000, 0, []);
  const p2 = player(2, 'B', 10000, 0, []);
  const t = tableWith([p1, p2], { seats: 2, game: 'rush' });
  t.street = 'idle';
  t.handNo = 0;
  t.startHand();
  const actor = t.actor;
  t.act(actor, 'fold');
  const folded = [p1, p2].find((p) => p.folded);
  assert.equal(folded.rushQueued, true);
});


test('run it twice handles a multiway side pot and conserves chips', () => {
  const p1 = player(1, 'Short', 1000, 100, ['As', 'Ks'].map(C));
  const p2 = player(2, 'Big A', 1000, 300, ['Qd', 'Qc'].map(C));
  const p3 = player(3, 'Big B', 1000, 300, ['7h', '8h'].map(C));
  const t = tableWith([p1, p2, p3], { seats: 3 });
  t.pot = 700;
  t.deck = makeDeck(false);
  t.runItTwice = true;
  t.runoutTwice();
  assert.equal(t.result.boards.length, 2);
  const paid = t.result.winners.reduce((a, w) => a + w.amount, 0);
  assert.equal(paid, 665);
});

test('time bank extension is clamped and usable once per hand', () => {
  const t = tableWith([player(1, 'A', 1000, 0, []), player(2, 'B', 1000, 0, [])]);
  t.street = 'river';
  t.actor = 1;
  t.actionEndsAt = Date.now();
  t.timeBankUsed = new Set();
  const first = t.useTimeBank(1, 30);
  assert.equal(first.ok, true);
  assert.equal(first.seconds, 30);
  assert.ok(first.endsAt >= Date.now() + 29000);
  const second = t.useTimeBank(1, 30);
  assert.equal(second.ok, false);
  const clamped = tableWith([player(3, 'C', 1000, 0, []), player(4, 'D', 1000, 0, [])]);
  clamped.actor = 3;
  clamped.actionEndsAt = Date.now();
  clamped.timeBankUsed = new Set();
  assert.equal(clamped.useTimeBank(3, 999).seconds, 60);
});

test('tournament blinds advance on the clock, not hand count', () => {
  const t = new PokerTable({
    id: 'clock', name: 'Clock', game: 'holdem', sb: 50, bb: 100, seats: 2,
    min_buyin: 1000, max_buyin: 10000,
    tournament: { blindEvery: 0.001, level: 1, prizePool: 10000 },
  });
  t.street = 'ended';
  t.nextHandAt = 0;
  const sb = t.sb;
  t.tick(Date.now() + 100);
  assert.equal(t.tournament.level, 2);
  assert.ok(t.sb > sb);
});

test('flights of one tournament share the blind level and clock', () => {
  const shared = { blindEvery: 0.001, level: 1, prizePool: 10000 };
  const cfg = { game: 'holdem', sb: 50, bb: 100, seats: 2, min_buyin: 1000, max_buyin: 10000, tournament: shared };
  const a = new PokerTable({ id: 'flight-a', name: 'A', ...cfg });
  const b = new PokerTable({ id: 'flight-b', name: 'B', ...cfg });
  a.street = 'ended';
  b.street = 'ended';
  const at = Date.now() + 100;
  a.tick(at); // the first flight to tick advances the shared clock
  assert.equal(shared.level, 2);
  assert.equal(a.sb, 75);
  b.tick(at); // a flight that ticked later catches up without double-advancing
  assert.equal(shared.level, 2);
  assert.equal(b.sb, a.sb);
  assert.equal(b.bb, a.bb);
  // A flight opened after the level moved starts on the current blinds.
  const late = new PokerTable({ id: 'flight-c', name: 'C', ...cfg });
  assert.equal(late.sb, a.sb);
  assert.equal(late.bb, a.bb);
});

test('a player can show one card or both after the hand ends', () => {
  const t = new PokerTable({
    id: 'show', name: 'Show', game: 'holdem', sb: 50, bb: 100, seats: 2,
    min_buyin: 1000, max_buyin: 5000,
  });
  const hero = player(1, 'Hero', 900, 100, [C('As'), C('Kh')]);
  const other = player(2, 'Other', 900, 100, [C('Qd'), C('Jc')]);
  t.seats[0].player = hero;
  t.seats[1].player = other;
  t.street = 'preflop';
  const events = [];
  t.on((e) => events.push(e));

  assert.equal(t.showCards(1, [0]).ok, false, 'cards can only be shown after the hand');
  t.street = 'ended';
  assert.equal(t.showCards(1, [9]).ok, false, 'only dealt cards can be picked');
  other.folded = true;
  assert.equal(t.showCards(2, [0]).ok, false, 'a folded player cannot show');
  other.folded = false;

  assert.equal(t.showCards(1, [0]).ok, true);
  const half = t.snapshotFor(2).players.find((p) => p.id === 1);
  assert.deepEqual(half.shown, [0]);
  assert.equal(half.cards[0], 'As');
  assert.equal(half.cards[1], '??', 'the other card stays hidden');
  const own = t.snapshotFor(1).players.find((p) => p.id === 1);
  assert.deepEqual(own.cards, ['As', 'Kh'], 'the owner always sees both');

  assert.equal(t.showCards(1, [1]).ok, true);
  const all = t.snapshotFor(2).players.find((p) => p.id === 1);
  assert.deepEqual(all.cards, ['As', 'Kh']);
  assert.equal(all.reveal, true);
  assert.deepEqual(events.find((e) => e.type === 'cards_shown').cards, ['As']);
});

test('a busted cash player gets a reload window before the next deal', () => {
  const t = new PokerTable({
    id: 'reload', name: 'Reload', game: 'holdem', sb: 50, bb: 100, seats: 2,
    min_buyin: 1000, max_buyin: 5000,
  });
  const busted = player(1, 'Busted', 0, 0, []);
  const other = player(2, 'Other', 1000, 0, []);
  t.seats[0].player = busted;
  t.seats[1].player = other;
  t.street = 'ended';
  t.nextHandAt = Date.now() - 1;
  const events = [];
  t.on((e) => events.push(e));

  const now = Date.now();
  assert.equal(t.openRebuyWindow(now), true);
  assert.ok(t.nextHandAt >= now + 9000, 'the next deal is pushed out by the window');
  const offer = events.find((e) => e.type === 'rebuy_offer');
  assert.equal(offer.playerId, 1);
  assert.equal(offer.min, 1000, 'a reload brings the stack back to the minimum');

  // Ticking inside the window must not deal the next hand.
  t.tick(now + 100);
  assert.equal(t.street, 'ended');
  assert.equal(t.handNo, 0);

  // Reloading clears the prompt and pulls the next deal in.
  busted.stack = 1000;
  t.clearRebuyHold(1);
  assert.ok(t.nextHandAt <= Date.now() + 1600);
  assert.equal(t.openRebuyWindow(now + 200), false, 'a prompted bust is not offered twice');
});

test('tournaments and Spin & Gold never open a reload window', () => {
  for (const extra of [{ tournament: { prizePool: 1000, level: 1, blindEvery: 10 } }, { game: 'spingold' }]) {
    const t = new PokerTable({
      id: 'noreload', name: 'No reload', game: 'holdem', sb: 50, bb: 100, seats: 2,
      min_buyin: 1000, max_buyin: 5000, ...extra,
    });
    t.seats[0].player = player(1, 'Busted', 0, 0, []);
    t.seats[1].player = player(2, 'Other', 1000, 0, []);
    t.street = 'ended';
    t.nextHandAt = Date.now() - 1;
    assert.equal(t.openRebuyWindow(), false);
  }
});

test('table snapshot exposes the active hand id for evidence reporting', () => {
  const t = tableWith([player(1, 'A', 1000, 0, []), player(2, 'B', 1000, 0, [])]);
  t.handId = 'hand-evidence-42';
  assert.equal(t.snapshotFor().handId, 'hand-evidence-42');
});
