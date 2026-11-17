// Run it 2-3 times, dealt like a live dealer (David, 15 Nov): every board comes out on its own and
// slowly (flop, turn, river), the next board only after the last; once all are out the table waits,
// then names the winner of board 1, then board 2, then board 3. Chips move only after that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDeck } from './poker.js';
import { PokerTable } from './table.js';
import { SHOWDOWN_CLEAR_MS, runPresentationMs, runResultAt } from './handPacing.js';
import { runSchedule, sharedCount } from '../src/game/runItPacing.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const C = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
const player = (id, nick, stack, totalBet, cards) => ({
  id, nick, avatar: '', stack, isBot: false, sittingOut: false, disconnected: false,
  inHand: true, folded: false, allIn: true, bet: 0, totalBet, cards, acted: true,
  reveal: false, lastAction: null, winAmount: 0, seat: 0, timeBank: 30, joinedAt: Date.now(), handsPlayed: 0, won: 0,
});
function tableWith(players, board = []) {
  const t = new PokerTable({ id: 't', name: 'T', game: 'holdem', sb: 50, bb: 100, seats: players.length, min_buyin: 100, max_buyin: 100000 });
  players.forEach((p, i) => { p.seat = i; t.seats[i].player = p; });
  t.pot = players.reduce((a, p) => a + p.totalBet, 0);
  t.street = 'showdown';
  t.handNo = 1;
  t.deck = makeDeck(false).filter((c) => !board.some((b) => b.r === c.r && b.s === c.s));
  t.board = board;
  return t;
}

const flop = ['2c', '7d', 'Jh'];
const boardsOf = (runs, shared) => Array.from({ length: runs }, (_, b) => [...shared, ...['As', 'Kd', 'Qc', '9h', '4s'].slice(0, 5 - shared.length).map((c, i) => (b ? c[0] + 'cdhs'[(b + i) % 4] : c))]);

test('the cards already on the table are shared by every board', () => {
  assert.equal(sharedCount(boardsOf(3, flop)), 3);
  assert.equal(sharedCount(boardsOf(2, [])), 0);
});

test('each board comes out on its own, slowly: the next one only after the last card of the one before', () => {
  for (const shared of [[], flop, [...flop, '5s']]) {
    const boards = boardsOf(3, shared);
    const { delays } = runSchedule(boards);
    for (let b = 0; b < 3; b++) {
      for (let i = 0; i < shared.length; i++) assert.equal(delays[b][i], null, 'shared cards stay as they are');
      const own = delays[b].slice(shared.length);
      for (let i = 1; i < own.length; i++) assert.ok(own[i] >= own[i - 1], 'in order');
      if (b > 0) {
        const prevLast = Math.max(...delays[b - 1].filter((d) => d !== null));
        assert.ok(Math.min(...own) - prevLast >= 1000, `board ${b + 1} waits a full second after board ${b}`);
      }
    }
  }
});

test('the turn and the river each take their own beat', () => {
  const { delays } = runSchedule(boardsOf(2, flop));
  assert.ok(delays[0][4] - delays[0][3] >= 900);
});

test('when every board is out the table waits, then names the winner of each board in turn', () => {
  const { delays, resultAt, done } = runSchedule(boardsOf(3, flop));
  const lastCard = Math.max(...delays.flat().filter((d) => d !== null));
  assert.equal(resultAt.length, 3);
  assert.ok(resultAt[0] - lastCard >= 1000, 'a pause before the first result');
  assert.ok(resultAt[1] - resultAt[0] >= 1200 && resultAt[2] - resultAt[1] >= 1200, 'one board at a time');
  assert.ok(done > resultAt[2]);
});

test('the server reports the winner of every board separately', () => {
  const a = player(1, 'Ann', 0, 500, ['As', 'Ks'].map(C));
  const b = player(2, 'Bob', 0, 500, ['2d', '7c'].map(C));
  const t = tableWith([a, b], flop.map(C));
  t.runoutMulti(3);
  const byBoard = t.result.byBoard;
  assert.equal(byBoard.length, 3);
  for (const run of byBoard) {
    assert.ok(run.length >= 1);
    for (const w of run) assert.ok(w.nick && w.amount > 0 && w.hand);
  }
  const perBoard = byBoard.flat().reduce((s, w) => s + w.amount, 0);
  assert.equal(perBoard, t.result.winners.reduce((s, w) => s + w.amount, 0));
});

test('the next hand waits for every board, every result and the usual showdown clear', () => {
  for (const [runs, shared] of [[2, []], [3, []], [3, flop], [2, [...flop, '5s']]]) {
    const players = [player(1, 'Ann', 0, 500, ['As', 'Ks'].map(C)), player(2, 'Bob', 0, 500, ['2d', '7c'].map(C))];
    const t = tableWith(players, shared.map(C));
    const before = Date.now();
    t.runoutMulti(runs);
    const { done } = runSchedule(t.result.boards);
    assert.ok(runPresentationMs(runs, shared.length) >= done, `server covers the client show (${runs}x, ${shared.length} shared)`);
    assert.ok(t.nextHandAt - before >= SHOWDOWN_CLEAR_MS + done);
  }
});

test('the table deals the extra boards with the schedule and holds the chips until the results', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /runSchedule\(/);
  assert.match(page, /className="board second-board"[\s\S]{0,400}dealt=\{delay !== null\}/);
  assert.match(page, /runHeld/);
});

test('who won is written in the chat, not left on the table', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.doesNotMatch(page, /wins \$\{chip\(w\.amount\)\}/, 'no winner text on the table');
  assert.doesNotMatch(page, /run-results/);
  const server = read('server/index.js');
  assert.match(server, /dealerBoardTexts\(h\.result, table\)/, 'one chat line per board');
  assert.match(server, /runResultAt\(/, 'each board line waits until that board is decided on screen');
  assert.match(server, /evt\.type === 'action'[\s\S]{0,300}dealerActionText\(/, 'bets go to the chat too');
});

test('each board result is due exactly when the table reaches it', () => {
  for (const [runs, shared] of [[2, []], [3, flop], [3, [...flop, '5s']]]) {
    const { resultAt } = runSchedule(boardsOf(runs, shared));
    assert.deepEqual(runResultAt(runs, shared.length), resultAt);
  }
});

test('the stacks do not give the result away before the boards are out', () => {
  assert.match(read('src/pages/TablePage.tsx'), /stackLabel\(runHeld \? \(p\.stack \?\? 0\) - \(p\.winAmount \|\| 0\) : p\.stack\)/);
});
