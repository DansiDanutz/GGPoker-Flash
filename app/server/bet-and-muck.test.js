import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { betMuckRank, executeBetAndMuck } from './bet-and-muck.js';
import { bestHoldem, cardStr, makeDeck } from './poker.js';
import { handForViewer } from './hand-history.js';

const C = (text) => ({ r: text[0], s: text[1], v: '23456789TJQKA'.indexOf(text[0]) + 2 });
const player = (id, cards) => ({
  id, nick: `P${id}`, avatar: '', stack: 1000, isBot: false, sittingOut: false, disconnected: false,
  inHand: true, folded: false, allIn: false, bet: 0, totalBet: 0, cards: cards.map(C), acted: false,
  reveal: false, lastAction: null, winAmount: 0, seat: id - 1, timeBank: 30, autoMuck: true,
});

function fixture() {
  const table = new PokerTable({ id: `bet-muck-${Math.random()}`, name: 'Bet Muck', game: 'holdem', seats: 2, sb: 50, bb: 100, min_buyin: 100, max_buyin: 2000, bet_and_muck: 1, bet_muck_condition_rank: 1, rakePercent: 0 });
  table.seats[0].player = player(1, ['7c', '5s']);
  table.seats[1].player = player(2, ['Ah', 'Kd']);
  table.board = ['2h', '4d', '8c', 'Jc', '3s'].map(C);
  table.deck = makeDeck().filter((card) => ![...table.board, ...table.seats[0].player.cards, ...table.seats[1].player.cards].map(cardStr).includes(cardStr(card)));
  table.street = 'river';
  table.actor = 1;
  table.handNo = 1;
  table.handId = 'flagged-hand';
  return table;
}

test('rank threshold permits the boundary and rejects the next stronger class', () => {
  const table = fixture();
  const rank = betMuckRank(bestHoldem(table.seats[0].player.cards, table.board).score);
  table.cfg.bet_muck_condition_rank = rank;
  assert.equal(executeBetAndMuck(table, 1, { action: 'bet', amount: 100 }).ok, true);
  const rejected = fixture();
  rejected.cfg.bet_muck_condition_rank = rank + 1;
  assert.equal(executeBetAndMuck(rejected, 1, { action: 'bet', amount: 100 }).ok, false);
  assert.equal(rejected.pot + rejected.totalBets(), 0);
});

test('a call immediately folds the flagged bettor, pays the opponent and hides every private face', () => {
  const table = fixture();
  let saved;
  table.hooks.onHandSave = (hand) => { saved = hand; };
  assert.equal(executeBetAndMuck(table, 1, { action: 'bet', amount: 100 }).ok, true);
  assert.equal(table.actor, 2);
  assert.equal(table.act(2, 'call').ok, true);
  assert.equal(table.seats[0].player.betMuckFold, true);
  assert.equal(table.seats[0].player.folded, true);
  assert.equal(table.seats[1].player.stack, 1100);
  assert.equal(table.seats[0].player.stack + table.seats[1].player.stack, 2000);
  assert.equal(table.result.reason, 'fold');
  assert.deepEqual(table.snapshotFor(2).players[0].cards, []);
  assert.deepEqual(table.snapshotFor(1).players[0].cards, ['7c', '5s']);
  const view = handForViewer({ players: JSON.stringify(saved.players), result: JSON.stringify(saved.result), actions: '[]', meta: '{}', board: saved.board.join(' '), pot: saved.pot }, 2);
  assert.deepEqual(view.players[0].cards, []);
  assert.equal(JSON.stringify(view).includes('7c'), false);
  assert.equal(JSON.stringify(view).includes('5s'), false);
});

test('an opponent fold uses ordinary settlement and a raise consumes the flag', () => {
  const folded = fixture();
  executeBetAndMuck(folded, 1, { action: 'bet', amount: 100 });
  assert.equal(folded.act(2, 'fold').ok, true);
  assert.equal(folded.seats[0].player.stack, 1000);
  assert.equal(!!folded.seats[0].player.betMuckFold, false);
  const raised = fixture();
  executeBetAndMuck(raised, 1, { action: 'bet', amount: 100 });
  assert.equal(raised.act(2, 'raise', 200).ok, true);
  assert.equal(raised.betAndMuck.status, 'consumed');
  assert.equal(raised.seats[0].player.folded, false);
  assert.equal(raised.actor, 1);
  assert.equal(raised.pot + raised.totalBets(), 300);
});

test('an all-in flagged bet and all-in call conserve every chip', () => {
  const table = fixture();
  assert.equal(executeBetAndMuck(table, 1, { action: 'bet', amount: 1000 }).ok, true);
  assert.equal(table.act(2, 'allin').ok, true);
  assert.equal(table.seats[0].player.stack, 0);
  assert.equal(table.seats[1].player.stack, 2000);
  assert.equal(table.seats[0].player.betMuckFold, true);
});

test('wrong actors and a restored pending response cannot bypass the flag', () => {
  const table = fixture();
  assert.equal(executeBetAndMuck(table, 2, { action: 'bet', amount: 100 }).ok, false);
  executeBetAndMuck(table, 1, { action: 'bet', amount: 100 });
  const restored = new PokerTable(table.cfg);
  restored.restoreRecoveryState(JSON.parse(JSON.stringify(table.recoveryState())));
  assert.equal(restored.betAndMuck.status, 'awaiting-response');
  assert.equal(restored.actor, 2);
  assert.equal(restored.act(2, 'call').ok, true);
  assert.equal(restored.seats[0].player.betMuckFold, true);
  assert.equal(restored.seats[0].player.stack + restored.seats[1].player.stack, 2000);
});
