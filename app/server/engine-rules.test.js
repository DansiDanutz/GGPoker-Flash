import test from 'node:test';
import assert from 'node:assert/strict';
import { score5, compareScores, bestHoldem, estimateEquity } from './poker.js';
import { PokerTable } from './table.js';

const C = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
const START = 10_000;

// Seats `stacks.length` human players and starts one hand with the button on seat 0.
function deal(stacks, cfg = {}) {
  const events = [];
  const t = new PokerTable({
    id: 'rules', name: 'Rules', game: 'holdem', sb: 50, bb: 100, seats: stacks.length,
    min_buyin: 100, max_buyin: 1_000_000, botIterations: 8, ...cfg,
  }, { onEvent: (_t, e) => events.push(e) });
  t.nextHandAt = Date.now() + 1e9; // hold the auto-start until everyone is seated
  stacks.forEach((stack, i) => t.sit({ id: i + 1, nick: `P${i + 1}` }, i, stack));
  t.nextHandAt = 0;
  t.startHand();
  return { t, events, p: (i) => t.seats[i].player };
}

const ok = (res) => assert.equal(res.ok, true, res.error);
const totalChips = (t) => t.seats.reduce((a, s) => a + (s.player ? s.player.stack + s.player.bet : 0), 0);

test('pre-flop action starts left of the big blind, post-flop left of the button', () => {
  const { t } = deal([START, START, START, START]);
  assert.equal(t.button, 0);
  assert.equal(t.actor, 4, 'UTG (seat 3) acts first pre-flop');
  ok(t.act(4, 'call')); ok(t.act(1, 'call')); ok(t.act(2, 'call'));
  assert.equal(t.actor, 3, 'big blind keeps the option');
  ok(t.act(3, 'check'));
  assert.equal(t.street, 'flop');
  assert.equal(t.actor, 2, 'small blind acts first post-flop');
});

test('heads-up: the button posts the small blind and acts first pre-flop, last post-flop', () => {
  const { t, p } = deal([START, START]);
  assert.equal(p(0).bet, 50);
  assert.equal(p(1).bet, 100);
  assert.equal(t.actor, 1);
  ok(t.act(1, 'call')); ok(t.act(2, 'check'));
  assert.equal(t.street, 'flop');
  assert.equal(t.actor, 2);
});

test('an all-in below the current bet is a call and never lowers the bet', () => {
  const { t, p } = deal([START, START, 150]);
  ok(t.act(1, 'raise', 400));
  ok(t.act(2, 'fold'));
  ok(t.act(3, 'allin'));
  assert.equal(t.street, 'ended', 'nobody is left to act, so the board runs out');
  assert.equal(t.board.length, 5);
  // Seat 0 only risked the 150 the short stack could cover.
  assert.ok(p(0).stack === START - 150 || p(0).stack > START);
  assert.equal(totalChips(t) + t.rake, START * 2 + 150);
});

test('a short all-in does not reopen the betting for players who already acted', () => {
  const { t, p } = deal([START, START, 250]);
  ok(t.act(1, 'raise', 200));
  ok(t.act(2, 'call'));
  ok(t.act(3, 'allin')); // raises by only 50, less than the 100 minimum
  assert.equal(t.currentBet, 250);
  assert.equal(t.actor, 1);
  assert.equal(t.act(1, 'raise', 900).ok, false);
  ok(t.act(1, 'call'));
  ok(t.act(2, 'call'));
  assert.equal(t.street, 'flop');
  assert.equal(p(0).totalBet, 250);
});

test('a full raise reopens the betting', () => {
  const { t } = deal([START, START, START]);
  ok(t.act(1, 'raise', 200));
  ok(t.act(2, 'raise', 600));
  ok(t.act(3, 'fold'));
  ok(t.act(1, 'raise', 1400));
  assert.equal(t.currentBet, 1400);
});

test('a hand that ends before the flop is not raked and the uncalled bet is returned', () => {
  const { t, p } = deal([START, START, START]);
  ok(t.act(1, 'raise', 1000));
  ok(t.act(2, 'fold'));
  ok(t.act(3, 'fold'));
  assert.equal(t.street, 'ended');
  assert.equal(t.rake, 0);
  assert.equal(t.result.pot, 250, 'pot is the blinds plus the called part of the raise');
  assert.equal(p(0).stack, START + 150);
  assert.equal(totalChips(t), START * 3);
});

test('an uncalled river bet is returned before the pot is raked', () => {
  const { t, p } = deal([START, START]);
  ok(t.act(1, 'call')); ok(t.act(2, 'check'));
  for (const street of ['flop', 'turn']) {
    assert.equal(t.street, street);
    ok(t.act(2, 'check')); ok(t.act(1, 'check'));
  }
  ok(t.act(2, 'bet', 5000));
  ok(t.act(1, 'fold'));
  assert.equal(t.result.pot, 200);
  assert.equal(t.rake, 10);
  assert.equal(p(1).stack, START + 100 - 10);
});

test('a player who leaves mid-hand forfeits their chips to the pot and the hand resolves once', () => {
  const { t, p, events } = deal([START, START, START]);
  ok(t.act(1, 'call')); ok(t.act(2, 'call')); ok(t.act(3, 'check'));
  ok(t.act(2, 'bet', 200));
  assert.equal(t.actor, 3);
  assert.equal(t.stand(1).stack, START - 100); // not the actor
  assert.equal(t.actor, 3, 'the action stays where it was');
  ok(t.act(3, 'fold'));
  assert.equal(events.filter((e) => e.type === 'win').length, 1);
  assert.equal(t.result.winners[0].id, 2);
  assert.equal(t.result.pot, 300, 'the departed player\'s 100 stays in the pot');
  assert.equal(p(1).stack, START - 100 + 300 - t.rake);
});

test('heads-up: when the opponent leaves, the remaining player wins the pot', () => {
  const { t, p, events } = deal([START, START]);
  assert.equal(t.actor, 1);
  t.stand(2);
  assert.equal(t.street, 'ended');
  assert.equal(events.filter((e) => e.type === 'win').length, 1);
  assert.equal(p(0).stack, START + 100, 'wins the big blind the leaver had posted');
});

test('when the actor leaves, the action moves to the next player', () => {
  const { t } = deal([START, START, START]);
  assert.equal(t.actor, 1);
  t.stand(1);
  assert.equal(t.street, 'preflop');
  assert.equal(t.actor, 2);
});

test('a player with chips left is not asked to act against all-in opponents', () => {
  const { t } = deal([START, 300]);
  ok(t.act(1, 'raise', 300));
  ok(t.act(2, 'call'));
  assert.equal(t.street, 'ended');
  assert.equal(t.board.length, 5);
  assert.equal(t.actor, null);
});

test('short deck: a flush beats a full house and A-6-7-8-9 is a straight', () => {
  const flush = score5(['Ah', 'Kh', '9h', '7h', '6h'].map(C), true);
  const full = score5(['Kh', 'Kd', 'Kc', '9s', '9d'].map(C), true);
  assert.ok(compareScores(flush, full) > 0);
  const wheel = score5(['As', '6d', '7c', '8h', '9s'].map(C), true);
  assert.equal(wheel[0], 4);
  assert.equal(wheel[1], 9);
  assert.notEqual(score5(['As', '2d', '3c', '4h', '5s'].map(C), true)[0], 4);
  assert.equal(score5(['As', '6d', '7c', '8h', '9s'].map(C), false)[0], 0, 'not a straight in a full deck');
  assert.equal(bestHoldem(['Ah', 'Kh'].map(C), ['9h', '7h', '6h', 'Kd', 'Kc'].map(C), true).name, 'Flush');
});

test('short deck table awards the pot to a flush over a full house', () => {
  const { t, p } = deal([START, START], { game: 'shortdeck' });
  p(0).cards = ['Ah', 'Qh'].map(C);
  p(1).cards = ['Kd', 'Kc'].map(C);
  t.deck = ['6c', '9d', 'Ks', '9h', '7h', '6h'].map(C); // popped from the end
  ok(t.act(1, 'allin')); ok(t.act(2, 'call'));
  assert.equal(t.result.winners.length, 1);
  assert.equal(t.result.winners[0].id, 1);
  assert.equal(t.result.winners[0].hand, 'Flush');
});

test('Omaha deals four cards, five-card Omaha deals five, and hides them from opponents', () => {
  const plo = deal([START, START], { game: 'omaha' });
  assert.equal(plo.p(0).cards.length, 4);
  const plo5 = deal([START, START], { game: 'omaha5' });
  assert.equal(plo5.p(1).cards.length, 5);
  const view = plo5.t.snapshotFor(1);
  assert.deepEqual(view.players[1].cards, ['??', '??', '??', '??', '??']);
  assert.equal(view.players[0].cards.length, 5);
  assert.ok(!view.players[0].cards.includes('??'));
});

test('pot-limit Omaha caps a raise at the size of the pot', () => {
  const { t, p } = deal([START, START], { game: 'omaha' });
  // Heads-up pre-flop: 150 in the pot, 50 to call, so the largest raise is to 100 + 200 = 300.
  assert.equal(t.snapshotFor(1).maxRaiseTo, 300);
  ok(t.act(1, 'allin'));
  assert.equal(p(0).bet, 300);
  assert.equal(p(0).allIn, false);
  assert.equal(t.snapshotFor(2).maxRaiseTo, 900);
});

test('All-in or Fold only accepts a shove, a call of a shove, or a fold', () => {
  const { t, p } = deal([4000, 4000, 4000], { game: 'aof' });
  assert.equal(t.actor, 1);
  assert.equal(p(0).allIn, false, 'nobody is forced all-in before acting');
  assert.equal(t.act(1, 'call').ok, false);
  assert.equal(t.act(1, 'raise', 300).ok, false);
  ok(t.act(1, 'allin'));
  ok(t.act(2, 'fold'));
  ok(t.act(3, 'call'));
  assert.equal(t.street, 'ended');
  assert.equal(t.board.length, 5);
  assert.equal(totalChips(t) + t.rake, 12000);
});

test('All-in or Fold: folding around gives the big blind the pot', () => {
  const { t, p } = deal([4000, 4000, 4000], { game: 'aof' });
  ok(t.act(1, 'fold')); ok(t.act(2, 'fold'));
  assert.equal(t.street, 'ended');
  assert.equal(p(2).stack, 4050);
});

test('two timeouts in a row sit a player out', () => {
  const { t, p } = deal([START, START, START]);
  const far = Date.now() + 1e7;
  t.tick(far);
  assert.equal(p(0).folded, true);
  assert.equal(p(0).sittingOut, false);
  p(0).missedTurns = 1;
  p(0).folded = false; t.actor = 1; t.actionEndsAt = 0;
  t.tick(far);
  assert.equal(p(0).sittingOut, true);
});

test('Omaha equity uses all hole cards', () => {
  const strong = estimateEquity(['As', 'Ah', 'Kd', 'Kc'].map(C), [], 1, false, 60, true);
  const weak = estimateEquity(['2s', '7h', '3d', '9c'].map(C), [], 1, false, 60, true);
  assert.ok(strong > weak);
});

// Plays bot-only tables and checks that every chip is accounted for after every hand.
for (const game of ['holdem', 'omaha', 'omaha5', 'shortdeck', 'aof']) {
  test(`${game}: chips are conserved across simulated hands with players leaving`, () => {
    let atStart = 0;
    let leftWith = 0;
    let hands = 0;
    const t = new PokerTable({
      id: `sim-${game}`, name: 'Sim', game, sb: 50, bb: 100, ante: game === 'shortdeck' ? 10 : 0,
      seats: 6, min_buyin: 2000, max_buyin: 6000, botIterations: 6,
    }, {
      onEvent: (table, e) => {
        if (e.type === 'hand_start') {
          atStart = table.seats.reduce((a, s) => a + (s.player ? s.player.stack + s.player.totalBet : 0), 0);
          leftWith = 0;
        }
        if (e.type === 'win') {
          hands++;
          const now = table.seats.reduce((a, s) => a + (s.player ? s.player.stack : 0), 0);
          assert.equal(now + table.rake + leftWith, atStart, `hand ${table.handNo} lost or created chips`);
          assert.equal(table.totalBets(), 0);
        }
      },
    });
    t.fillBots(6);
    const far = Date.now() + 1e9;
    let rng = 12345;
    const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    for (let step = 0; step < 6000 && hands < 60; step++) {
      t.tick(far);
      if (t.handInProgress() && rand() < 0.03) {
        const seated = t.occupiedSeats();
        const victim = seated[Math.floor(rand() * seated.length)];
        leftWith += t.stand(victim.player.id).stack;
      }
      if (!t.handInProgress()) t.fillBots(6);
    }
    assert.ok(hands >= 60, `only ${hands} hands completed — the table stalled`);
  });
}
