import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { makeDeck, cardStr } from './poker.js';

const C = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });

function player(id, nick, stack, totalBet, cards, folded = false) {
  return {
    id, nick, avatar: '', stack, isBot: false, sittingOut: false, disconnected: false,
    inHand: true, folded, allIn: true, bet: 0, totalBet, cards, acted: true,
    reveal: false, lastAction: null, winAmount: 0, seat: 0, timeBank: 30,
    joinedAt: Date.now(), handsPlayed: 0, won: 0,
  };
}

function fixture() {
  const players = [
    player(1, 'Short', 1000, 300, ['As', 'Ks'].map(C)),
    player(2, 'Big', 1000, 1000, ['Ah', 'Ad'].map(C)),
    player(3, 'Folded', 1000, 300, ['2c', '3c'].map(C), true),
  ];
  const t = new PokerTable({ id: 'test', name: 'Test', game: 'holdem', sb: 50, bb: 100, seats: 3, min_buyin: 100, max_buyin: 100000, rimt_mode: 'negotiated' });
  players.forEach((p, i) => { p.seat = i; t.seats[i].player = p; });
  t.pot = 1600;
  t.street = 'river';
  t.handNo = 1;
  t.handId = 'test-hand-1';
  t.board = ['Qs', 'Js', 'Ts'].map(C);
  t.deck = makeDeck().filter((card) => !t.board.concat(players.flatMap((p) => p.cards)).map(cardStr).includes(cardStr(card)));
  return { t, players };
}

test('negotiated RIMT pauses before runout and preserves chips across two boards', () => {
  const { t, players } = fixture();
  t.runout();
  assert.ok(t.rimt);
  assert.equal(t.board.length, 3);
  assert.equal(t.actor, null);
  assert.equal(t.rimtCommand(3, 2).ok, false);
  assert.equal(t.rimtCommand(players[t.rimt.proposer].id, 2).ok, true);
  const accepted = t.rimtCommand(players[t.rimt.decider].id, 'accept');
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.equal(t.boards.length, 2);
  assert.equal(t.result.rimt.runs, 2);
  assert.equal(t.result.rimt.sharedCount, 3);
  assert.equal(t.rake, 45);
  assert.ok(t.result.rimt.perRunPotAwards.length > 0);
  const conserved = players.reduce((sum, p) => sum + p.stack, 0) + t.rake;
  assert.equal(conserved, 4600);
  assert.equal(players[1].stack, 1700, 'the unmatched contribution returns once');
  assert.equal(players[2].stack, 1000, 'the folded contribution stays in the pot');
  assert.ok(t.result.winners.every((winner) => winner.amount >= 0));
});

test('declining a proposal settles one board and timeout is distinct from refusal', () => {
  const { t, players } = fixture();
  t.runout();
  const proposer = t.rimt.proposer;
  const decider = t.rimt.decider;
  assert.equal(t.rimtCommand(players[proposer].id, 3).ok, true);
  assert.equal(t.rimt.decider, decider);
  assert.equal(t.rimtCommand(players[decider].id, 'decline').ok, true);
  assert.equal(t.result.rimt.runs, 1);
  assert.equal(t.result.reason, 'showdown');
  assert.equal(players.reduce((sum, p) => sum + p.stack, 0) + t.rake, 4600);
});

test('deadline expiry resolves once without being shown as a refusal', () => {
  const { t } = fixture();
  t.runout();
  t.expireRimt(t.rimt.suggestUntil);
  assert.equal(t.result.rimt.runs, 1);
  assert.equal(t.result.rimt.reason, 'timeout');
  assert.equal(t.result.reason, 'showdown');
  assert.equal(t.street, 'ended');
});
