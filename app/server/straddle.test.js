// Native straddle (REA straddle-sitout.json: StraddleDecideView, OnAskingForStraddle,
// OnStraddleDecided, StraddleCommand/PostStraddle). The server asks every eligible player at
// once; the first Yes posts and opens a new round at double the amount, No clears only that
// player, a short stack may only go All-in. The bottom-left toggle is a per-player
// auto-straddle flag. No straddles heads-up. Ask window: 5 s (observed TIME badge).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { STRADDLE_ASK_MS } from './straddle.js';

function table(n = 4, cfg = {}, stacks = []) {
  const t = new PokerTable({ id: 'st', name: 'St', game: 'holdem', sb: 1, bb: 2, seats: n, min_buyin: 10, max_buyin: 1000, straddle: true, ...cfg });
  for (let i = 0; i < n; i++) {
    t.seats[i].player = {
      id: 'p' + i, nick: 'P' + i, avatar: '', stack: stacks[i] ?? 200, isBot: false, sittingOut: false, disconnected: false,
      inHand: false, folded: false, allIn: false, bet: 0, totalBet: 0, cards: [], acted: false, reveal: false,
      lastAction: null, winAmount: 0, seat: i, timeBank: 30, joinedAt: Date.now(), handsPlayed: 0, won: 0,
    };
  }
  t.street = 'idle'; t.handNo = 0; t.button = n - 1;
  return t;
}
const P = (t, i) => t.seats[i].player;

test('the hand pauses for a straddle round before any card is dealt', () => {
  const t = table(4);
  t.startHand(); // button 0, SB 1, BB 2, UTG 3
  assert.ok(t.straddleRound, 'straddle round open');
  assert.equal(t.straddleRound.amount, 4, 'first straddle is 2x BB');
  assert.equal(t.actor, null);
  assert.equal(P(t, 3).cards.length, 0);
  assert.deepEqual([...t.straddleRound.asked].sort(), ['p0', 'p3'], 'blinds are not asked');
});

test('Yes posts, doubles the next ask and the last straddler acts last', () => {
  const t = table(4);
  t.startHand();
  assert.equal(t.decideStraddle('p3', 'yes').ok, true);
  assert.equal(P(t, 3).bet, 4);
  assert.equal(P(t, 3).lastAction.action, 'Straddle');
  assert.equal(t.straddleRound.amount, 8);
  assert.deepEqual([...t.straddleRound.asked], ['p0']);
  assert.equal(t.decideStraddle('p0', 'yes').ok, true);
  assert.equal(P(t, 0).bet, 8);
  // nobody left to ask: cards are dealt and action opens left of the last straddler
  assert.equal(t.straddleRound, null);
  assert.equal(P(t, 1).cards.length, 2);
  assert.equal(t.currentBet, 8);
  assert.equal(t.actor, 'p1');
});

test('No clears only that player; when everyone declines the hand goes on', () => {
  const t = table(4);
  t.startHand();
  t.decideStraddle('p3', 'no');
  assert.ok(t.straddleRound, 'p0 still asked');
  t.decideStraddle('p0', 'no');
  assert.equal(t.straddleRound, null);
  assert.equal(t.currentBet, 2);
  assert.equal(t.actor, 'p3', 'UTG acts first without a straddle');
});

test('the round closes when the ask window runs out', () => {
  const t = table(4);
  t.startHand();
  const opened = t.straddleRound.endsAt;
  assert.ok(opened - Date.now() <= STRADDLE_ASK_MS);
  t.tick(opened + 1);
  assert.equal(t.straddleRound, null);
  assert.equal(P(t, 3).cards.length, 2);
});

test('a short stack may only go all in', () => {
  const t = table(4, {}, [200, 200, 200, 3]);
  t.startHand();
  assert.equal(t.decideStraddle('p3', 'yes').ok, false);
  assert.equal(t.decideStraddle('p3', 'allin').ok, true);
  assert.equal(P(t, 3).bet, 3);
  assert.equal(P(t, 3).allIn, true);
});

test('auto-straddle posts without a prompt', () => {
  const t = table(4);
  P(t, 3).autoStraddle = true;
  t.startHand();
  assert.equal(P(t, 3).bet, 4);
  assert.equal(t.straddleRound.amount, 8);
});

test('bots are never asked and no straddles heads-up or on tables without straddle', () => {
  const bots = table(4);
  for (const i of [0, 3]) bots.seats[i].player.isBot = true;
  bots.startHand();
  assert.equal(bots.straddleRound, null);
  assert.ok(bots.actor);
  const hu = table(2);
  hu.startHand();
  assert.equal(hu.straddleRound, null);
  const off = table(4, { straddle: false });
  off.startHand();
  assert.equal(off.straddleRound, null);
});

test('only asked players may decide, once', () => {
  const t = table(4);
  t.startHand();
  assert.equal(t.decideStraddle('p1', 'yes').ok, false, 'SB is not asked');
  t.decideStraddle('p3', 'no');
  assert.equal(t.decideStraddle('p3', 'yes').ok, false);
});

test('the snapshot shows the ask only to the asked player, with the all-in amount', () => {
  const t = table(4, {}, [200, 200, 200, 150]);
  P(t, 3).autoStraddle = false;
  t.startHand();
  const ask = t.snapshotFor('p3').straddleAsk;
  assert.deepEqual({ amount: ask.amount, allInTo: ask.allInTo, canStraddle: ask.canStraddle }, { amount: 4, allInTo: 150, canStraddle: true });
  assert.ok(ask.endsAt > Date.now());
  assert.equal(t.snapshotFor('p1').straddleAsk, null, 'SB is not asked');
  assert.equal(t.snapshotFor(null).straddleAsk, null, 'watchers see no ask');
});

test('the auto-straddle flag is per player and shows on the own seat only', () => {
  const t = table(4);
  assert.equal(t.setAutoStraddle('p3', true).ok, true);
  const mine = t.snapshotFor('p3').players.find((p) => p.isMe);
  assert.equal(mine.autoStraddle, true);
  const other = t.snapshotFor('p0').players.find((p) => p.id === 'p3');
  assert.equal(other.autoStraddle, undefined);
  assert.equal(t.setAutoStraddle('nobody', true).ok, false);
});
