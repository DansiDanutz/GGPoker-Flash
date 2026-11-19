import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { allInEquity, makeDeck } from './poker.js';

const card = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
const str = (c) => c.r + c.s;

function lockedTurn(deckOrder = null) {
  const holes = [['Tc', '2h'], ['9c', '9d']];
  const board = ['Ah', 'Kd', 'Qc', 'Js'];
  const t = new PokerTable({ id: 'eq', name: 'Equity', game: 'holdem', seats: 2, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {};
  holes.forEach((_, i) => t.sit({ id: `p${i}`, nick: `p${i}` }, i, 100));
  t.button = 0; t.street = 'turn'; t.handNo = 1; t.board = board.map(card);
  const used = new Set([...board, ...holes.flat()]);
  const remaining = makeDeck().filter((c) => !used.has(str(c)));
  t.deck = deckOrder ? deckOrder(remaining) : remaining;
  t.seats.forEach((s, i) => Object.assign(s.player, {
    inHand: true, folded: false, allIn: true, totalBet: 100, bet: 0, stack: 0,
    acted: true, cards: holes[i].map(card), winAmount: 0,
  }));
  t.pot = 200;
  return t;
}

test('all-in equity is public only after betting locks and sums to 100%', () => {
  const t = lockedTurn();
  const before = t.snapshotFor('p0');
  assert.equal(before.allInEquity, null);
  assert.deepEqual(before.players.find((p) => p.id === 'p1').cards, ['??', '??']);

  t.runout();
  const equity = t.snapshotFor(null).allInEquity;
  assert.equal(equity.handNo, 1);
  assert.deepEqual(equity.board, ['Ah', 'Kd', 'Qc', 'Js']);
  assert.equal(equity.estimated, false);
  assert.equal(equity.samples, 44);
  assert.deepEqual(equity.players, [
    { seat: 0, percent: 96.6 },
    { seat: 1, percent: 3.4 },
  ]);
  assert.equal(equity.players.reduce((sum, p) => sum + p.percent, 0), 100);
  assert.deepEqual(t.snapshotFor(null).players.map((p) => p.cards), [['Tc', '2h'], ['9c', '9d']]);
});

test('all-in equity ignores the pre-shuffled future runout and survives run twice', () => {
  const a = lockedTurn((deck) => deck);
  const b = lockedTurn((deck) => [...deck].reverse());
  a.runout();
  b.runout();
  assert.deepEqual(a.allInEquity, b.allInEquity);

  a.decideRuns('p0', 2);
  a.decideRuns('p1', 2);
  assert.equal(a.result.boards.length, 2);
  assert.deepEqual(a.snapshotFor(null).allInEquity.players, [
    { seat: 0, percent: 96.6 },
    { seat: 1, percent: 3.4 },
  ]);
});

test('preflop equity is a deterministic labeled estimate for supported Omaha hands', () => {
  const players = [
    { id: 'a', seat: 0, cards: ['As', 'Ah', 'Ks', 'Kh'].map(card) },
    { id: 'b', seat: 1, cards: ['Qc', 'Qd', 'Jc', 'Jd'].map(card) },
  ];
  const first = allInEquity(players, [], { omaha: true });
  const second = allInEquity(players, [], { omaha: true });
  assert.deepEqual(first, second);
  assert.equal(first.estimated, true);
  assert.equal(first.samples, 2000);
  assert.equal(first.players.reduce((sum, p) => sum + p.percent, 0), 100);
});

test('single-run all-ins table every contender before publishing their equity', () => {
  const t = lockedTurn();
  t.seats.forEach((s) => { s.player.isBot = true; s.player.autoMuck = true; });
  t.runout();
  const spectator = t.snapshotFor(null);
  assert.equal(t.runRound, null);
  assert.ok(spectator.allInEquity);
  assert.deepEqual(spectator.players.map((p) => p.cards), [['Tc', '2h'], ['9c', '9d']]);
});

test('equity weights side pots and splits tied eligible shares', () => {
  const players = [['Ah','Ad'],['Kh','Kd'],['Qh','Qd']].map((cards, seat) => ({id:seat,seat,cards:cards.map(card)}));
  const pots = [{amount:300,eligible:[0,1,2]},{amount:200,eligible:[1,2]}];
  assert.deepEqual(allInEquity(players,['2c','3d','4h','8s','9c'].map(card),{pots}).players,
    [{seat:0,percent:60},{seat:1,percent:40},{seat:2,percent:0}]);
  assert.deepEqual(allInEquity(players,['Ts','Js','Qs','Ks','As'].map(card),{pots}).players,
    [{seat:0,percent:20},{seat:1,percent:40},{seat:2,percent:40}]);
});
