// "You won" only for a real win: a pot someone else could also win, or more back than you put in.
// Chips that only come back to you (your unmatched all-in layer plus a folder's dead money) are not a win.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PokerTable } from './table.js';
import { heroWon } from '../src/game/showdown.ts';

const C = (s) => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
const player = (id, nick, stack, totalBet, cards, folded = false) => ({
  id, nick, avatar: '', stack, isBot: false, sittingOut: false, disconnected: false,
  inHand: true, folded, allIn: false, bet: 0, totalBet, cards, acted: true,
  reveal: false, lastAction: null, winAmount: 0, seat: 0, timeBank: 30,
  joinedAt: Date.now(), handsPlayed: 0, won: 0,
});
function tableWith(players) {
  const t = new PokerTable({ id: 'test', name: 'Test', game: 'holdem', sb: 50, bb: 100, seats: players.length, min_buyin: 100, max_buyin: 100000 });
  players.forEach((p, i) => { p.seat = i; t.seats[i].player = p; });
  t.pot = players.reduce((a, p) => a + p.totalBet, 0);
  t.street = 'river';
  t.handNo = 1;
  return t;
}

test('a layer only you can win is marked uncontested and carries what you put in', () => {
  const short = player(1, 'Short', 0, 300, ['As', 'Ks'].map(C));
  const big = player(2, 'Big', 0, 1000, ['Ah', 'Ad'].map(C));
  const folder = player(3, 'Folder', 0, 500, ['2c', '3c'].map(C), true);
  const t = tableWith([short, big, folder]);
  t.board = ['Qs', 'Js', 'Ts', '2d', '3c'].map(C);
  t.doShowdown();
  const mine = t.result.winners.filter((w) => w.id === 2);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].contested, false);
  assert.equal(mine[0].invested, 500, 'the unmatched 500 came straight back');
  assert.equal(heroWon(mine), false, 'Big lost the main pot; 400 back from the 500 really at risk is no win');
  const shorts = t.result.winners.filter((w) => w.id === 1);
  assert.equal(shorts[0].contested, true);
  assert.equal(heroWon(shorts), true);
});

test('winning a contested side pot is a win even when you lose the main pot', () => {
  assert.equal(heroWon([{ amount: 400, contested: true, invested: 1000 }]), true);
});

test('an uncontested pot counts only when it pays back more than you put in', () => {
  assert.equal(heroWon([{ amount: 150, contested: false, invested: 100 }]), true, 'everyone folded to your big blind');
  assert.equal(heroWon([{ amount: 90, contested: false, invested: 100 }]), false);
  assert.equal(heroWon([]), false);
});

test('every payout path marks contested and invested, and the banner asks heroWon', () => {
  const table = fs.readFileSync(path.join(import.meta.dirname, 'table.js'), 'utf8');
  assert.equal((table.match(/invested: this\.investedBy\(/g) || []).length, 3);
  const page = fs.readFileSync(path.join(import.meta.dirname, '..', 'src/pages/TablePage.tsx'), 'utf8');
  assert.match(page, /if \(heroWon\(mine\)\) \{/);
});
