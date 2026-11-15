// Run it 1-3 times: the all-in players choose, and every run keeps the cards already dealt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { makeDeck } from './poker.js';
import { MAX_RUNS, RUN_ASK_MS, agreedRuns, boardsFor, splitAmount } from './runItMulti.js';

const card = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
const str = (c) => c.r + c.s;

/** Two (or more) players all-in on the turn with a 4-card board; nothing left to bet. */
function allInOnTurn(holes, { stack = 100, game = 'holdem', bots = [] } = {}) {
  const t = new PokerTable({ id: 't', name: 't', game, seats: holes.length, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {};
  holes.forEach((_, i) => t.sit({ id: `p${i}`, nick: `p${i}`, isBot: bots.includes(i) }, i, stack));
  t.button = 0; t.street = 'turn'; t.handNo = 1;
  t.board = ['Qs', 'Jd', '5c', '4s'].map(card);
  const used = new Set([...t.board.map(str), ...holes.flat()]);
  t.deck = makeDeck(game === 'shortdeck').filter((c) => !used.has(str(c)));
  t.seats.filter((s) => s.player).forEach((s, i) => Object.assign(s.player, {
    inHand: true, folded: false, allIn: true, totalBet: stack, bet: 0, stack: 0, acted: true,
    cards: holes[i].map(card), winAmount: 0, isBot: bots.includes(i),
  }));
  t.pot = stack * holes.length;
  return t;
}
const chipsOnTable = (t) => t.seats.reduce((a, s) => a + (s.player?.stack || 0), 0);

test('boardsFor keeps the dealt cards on every run and never repeats a card', () => {
  const board = ['Qs', 'Jd', '5c', '4s'].map(card);
  const deck = makeDeck(false).filter((c) => !board.map(str).includes(str(c)));
  const { boards, deck: rest } = boardsFor(board, deck, 3);
  assert.equal(boards.length, 3);
  for (const b of boards) assert.deepEqual(b.slice(0, 4).map(str), board.map(str));
  const rivers = boards.map((b) => str(b[4]));
  assert.equal(new Set(rivers).size, 3);
  assert.equal(rest.length, deck.length - 3);
  assert.equal(deck.length, 48, 'the source deck is not mutated');
});

test('agreedRuns takes the smallest choice and defaults to once', () => {
  assert.equal(agreedRuns([]), 1);
  assert.equal(agreedRuns([2, 3]), 2);
  assert.equal(agreedRuns([3, 3]), 3);
  assert.equal(agreedRuns([1, 3]), 1);
  assert.equal(agreedRuns([9]), MAX_RUNS);
});

test('splitAmount spreads odd chips over the earlier runs', () => {
  assert.deepEqual(splitAmount(100, 3), [34, 33, 33]);
  assert.deepEqual(splitAmount(7, 2), [4, 3]);
  assert.deepEqual(splitAmount(5, 1), [5]);
});

test('an all-in with cards to come asks the all-in players and shows their hands', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.runout();
  assert.ok(t.runRound, 'a run choice is open');
  assert.equal(t.street, 'showdown');
  assert.ok(t.runRound.endsAt - Date.now() <= RUN_ASK_MS);
  assert.deepEqual(t.runAskFor('p0'), { endsAt: t.runRound.endsAt, maxRuns: MAX_RUNS, chosen: null });
  assert.equal(t.runAskFor('spectator'), null);
  assert.ok(t.seats.every((s) => !s.player || s.player.reveal), 'all-in hands are tabled');
  assert.equal(t.board.length, 4, 'nothing is dealt while the players decide');
});

test('running it twice on the turn keeps the four dealt cards on both boards', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.runout();
  t.decideRuns('p0', 2);
  t.decideRuns('p1', 3);
  assert.equal(t.runRound, null);
  assert.equal(t.result.boards.length, 2);
  for (const b of t.result.boards) assert.deepEqual(b.slice(0, 4), ['Qs', 'Jd', '5c', '4s']);
  assert.notEqual(t.result.boards[0][4], t.result.boards[1][4]);
  assert.equal(t.result.runs, 2);
  assert.equal(chipsOnTable(t), 200);
});

test('three runs split the pot three ways and conserve every chip', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']], { stack: 101 });
  t.runout();
  t.decideRuns('p0', 3);
  t.decideRuns('p1', 3);
  assert.equal(t.result.boards.length, 3);
  assert.equal(chipsOnTable(t), 202);
});

test('one player choosing once runs a single board', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.runout();
  t.decideRuns('p0', 1);
  t.decideRuns('p1', 3);
  assert.equal(t.result.boards, undefined);
  assert.equal(t.board.length, 5);
  assert.deepEqual(t.board.slice(0, 4).map(str), ['Qs', 'Jd', '5c', '4s']);
  assert.equal(chipsOnTable(t), 200);
});

test('no answer before the clock runs out means run it once', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.runout();
  t.decideRuns('p0', 2);
  t.tick(t.runRound.endsAt + 1);
  assert.equal(t.runRound, null);
  assert.equal(t.board.length, 5);
  assert.equal(chipsOnTable(t), 200);
});

test('bots are not asked; a human against a bot decides alone', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']], { bots: [1] });
  t.runout();
  assert.deepEqual([...t.runRound.asked], ['p0']);
  t.decideRuns('p0', 2);
  assert.equal(t.result.boards.length, 2);
});

test('with only bots all-in, or a player who turned the offer off, it runs once at once', () => {
  const bots = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']], { bots: [0, 1] });
  bots.runout();
  assert.equal(bots.runRound, null);
  assert.equal(bots.board.length, 5);

  const off = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  off.setRunItAsk('p1', false);
  off.runout();
  assert.equal(off.runRound, null, 'one player saying never means once');
  assert.equal(off.board.length, 5);
});

test('only an asked player can choose, and only 1 to 3 runs', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.runout();
  assert.equal(t.decideRuns('spectator', 2).ok, false);
  assert.equal(t.decideRuns('p0', 0).ok, false);
  assert.equal(t.decideRuns('p0', 4).ok, false);
  assert.equal(t.decideRuns('p0', 2).ok, true);
  assert.equal(t.decideRuns('p0', 3).ok, false, 'a choice is final');
});

test('Short Deck runs use Short Deck hand ranks', () => {
  // Flush beats a full house only in Short Deck.
  const t = new PokerTable({ id: 'sd', name: 'sd', game: 'shortdeck', seats: 2, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {};
  t.sit({ id: 'p0', nick: 'p0' }, 0, 100);
  t.sit({ id: 'p1', nick: 'p1' }, 1, 100);
  t.button = 0; t.street = 'turn'; t.handNo = 1;
  t.board = ['Qh', 'Qd', '9h', '6h'].map(card);
  const holes = [['Ah', '7h'], ['Qs', '9s']];
  const used = new Set([...t.board.map(str), ...holes.flat()]);
  // Rig the deck so both runs bring a blank river.
  t.deck = makeDeck(true).filter((c) => !used.has(str(c)) && !['h'].includes(c.s) && c.r !== '9' && c.r !== 'Q' && c.r !== '6');
  t.seats.forEach((s, i) => Object.assign(s.player, {
    inHand: true, folded: false, allIn: true, totalBet: 100, bet: 0, stack: 0, acted: true, cards: holes[i].map(card), winAmount: 0,
  }));
  t.pot = 200;
  t.runout();
  t.decideRuns('p0', 2);
  t.decideRuns('p1', 2);
  assert.equal(t.seats[0].player.stack, 200, 'the flush wins both runs');
});

test('rabbit hunt cards go only to players dealt into the hand', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.street = 'ended';
  t.board = t.board.slice(0, 3);
  assert.equal(t.rabbitCardsFor('spectator'), null);
  const cards = t.rabbitCardsFor('p0');
  assert.equal(cards.length, 2);
  assert.deepEqual(t.rabbitCardsFor('p1'), cards, 'everyone in the hand sees the same cards');
  t.board = [...t.board, ...['9c', '8c'].map(card)];
  assert.equal(t.rabbitCardsFor('p0'), null, 'nothing to hunt on a full board');
});

test('Rush (fast-fold) tables run all-ins once without asking', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']], { game: 'rush' });
  t.runout();
  assert.equal(t.runRound, null);
  assert.equal(t.board.length, 5);
});

test('a remembered choice of twice or three times is filled in, and when everyone has one it runs at once', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  assert.equal(t.setRunPref('p0', 3).ok, true);
  assert.equal(t.setRunPref('p1', 2).ok, true);
  t.runout();
  assert.equal(t.runRound, null, 'nobody has to be asked');
  assert.equal(t.result.boards.length, 2, 'the smaller remembered choice wins');
  assert.equal(chipsOnTable(t), 200);
});

test('a remembered choice is shown as already chosen while the other player decides', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.setRunPref('p0', 2);
  t.runout();
  assert.equal(t.runAskFor('p0').chosen, 2);
  assert.equal(t.runAskFor('p1').chosen, null);
  t.decideRuns('p1', 3);
  assert.equal(t.result.boards.length, 2);
});

test('a remembered choice of once runs a single board without asking', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  t.setRunPref('p1', 1);
  t.runout();
  assert.equal(t.runRound, null);
  assert.equal(t.board.length, 5);
  assert.equal(t.result.boards, undefined);
});

test('the remembered choice accepts only ask, 1, 2 or 3 and is only for seated players', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d']]);
  assert.equal(t.setRunPref('nobody', 2).ok, false);
  assert.equal(t.setRunPref('p0', 4).ok, false);
  assert.equal(t.setRunPref('p0', 'x').ok, false);
  assert.equal(t.setRunPref('p0', null).ok, true);
  assert.equal(t.seatOf('p0').player.runPref, null);
  t.setRunPref('p0', 3);
  const mine = t.snapshotFor('p0').players.find((s) => s && s.id === 'p0');
  assert.equal(mine.runPref, 3, 'a player sees their own remembered choice');
  const theirs = t.snapshotFor('p1').players.find((s) => s && s.id === 'p0');
  assert.equal(theirs.runPref, undefined, 'nobody else sees it');
});

test('a player leaving while the others choose keeps their answers and the clock (EGM LOW)', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d'], ['7h', '7d']]);
  t.runout();
  const { endsAt } = t.runRound;
  t.decideRuns('p0', 2);
  t.stand('p2');
  assert.ok(t.runRound, 'the round stays open for the player still deciding');
  assert.equal(t.runRound.endsAt, endsAt, 'the clock does not restart');
  assert.deepEqual(t.runAskFor('p0').chosen, 2, 'the answer already given is kept');
  assert.equal(t.runAskFor('p2'), null);
  t.decideRuns('p1', 2);
  assert.equal(t.result.boards.length, 2);
  assert.equal(chipsOnTable(t), 300, 'the leaver\'s chips stay in the pot');
});

test('when the last undecided player leaves, the board runs with the answers given', () => {
  const t = allInOnTurn([['Ah', 'Kd'], ['2c', '3d'], ['7h', '7d']]);
  t.runout();
  t.decideRuns('p0', 3);
  t.decideRuns('p1', 2);
  t.stand('p2');
  assert.equal(t.runRound, null);
  assert.equal(t.result.boards.length, 2);
});

test('the snapshot says whether Run it can ever apply at this table (EGM LOW)', () => {
  const make = (extra) => new PokerTable({ id: 'x', name: 'x', game: 'holdem', seats: 6, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, ...extra });
  assert.equal(make({}).snapshotFor(null).runItOffered, true, 'cash tables offer it');
  assert.equal(make({ game: 'rush' }).snapshotFor(null).runItOffered, false, 'Rush runs once');
  assert.equal(make({ game: 'spingold' }).snapshotFor(null).runItOffered, false, 'Spin runs once');
  const aof = make({}); aof.aof = true;
  assert.equal(aof.snapshotFor(null).runItOffered, false, 'All-in or Fold runs once');
  const mtt = make({}); mtt.tournament = { prizePool: 0 };
  assert.equal(mtt.snapshotFor(null).runItOffered, false, 'tournaments run once');
});
