// Native EAutoActionFlag.WaitForBlinds (REA straddle-sitout.json, rule 13): the client only
// toggles the flag; "wait for the big blind instead of posting now" is inferred from the name
// and the contrast with PostBlinds (medium confidence). A returning player with the flag on is
// not dealt in until the big blind reaches their seat, and then posts nothing extra.
// The sit-out countdown runs at 2x while players wait for a seat (TablePlayer.kickOutTimeRemaining).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { SIT_OUT_KICK_MS } from './sitOut.js';

function table(n = 4) {
  const t = new PokerTable({ id: 'wb', name: 'Wb', game: 'holdem', sb: 1, bb: 2, seats: n, min_buyin: 10, max_buyin: 1000 });
  for (let i = 0; i < n; i++) {
    t.seats[i].player = {
      id: 'p' + i, nick: 'P' + i, avatar: '', stack: 100, isBot: false, sittingOut: false, disconnected: false,
      inHand: false, folded: false, allIn: false, bet: 0, totalBet: 0, cards: [], acted: false, reveal: false,
      lastAction: null, winAmount: 0, seat: i, timeBank: 30, joinedAt: Date.now(), handsPlayed: 0, won: 0,
    };
  }
  t.street = 'idle'; t.handNo = 0;
  t.nextHandAt = Date.now() + 1e9; // no auto-deal between the steps of a test
  return t;
}
const P = (t, i) => t.seats[i].player;
const endHand = (t) => { t.street = 'ended'; for (const s of t.seats) if (s.player) s.player.inHand = false; };

test('a waiting player is skipped until the big blind reaches them, then posts only the BB', () => {
  const t = table(4);
  P(t, 3).sittingOut = true;
  t.button = 3; t.startHand(); // p3 misses a hand
  endHand(t);
  assert.equal(P(t, 3).missedBlinds, true);
  assert.equal(t.setWaitForBlinds('p3', true).ok, true);
  t.requestSitOut('p3', false);
  // button 0 -> SB 1, BB 2: p3 is not the BB, keeps waiting
  t.button = 3; t.startHand();
  assert.equal(P(t, 3).inHand, false, 'waits');
  assert.equal(P(t, 3).bet, 0);
  endHand(t);
  // button 1 -> SB 2, BB 3: the big blind reaches p3
  t.button = 0; t.startHand();
  assert.equal(P(t, 3).inHand, true, 'dealt in as the big blind');
  assert.equal(t.bbSeat, 3);
  assert.equal(P(t, 3).bet, 2, 'posts the big blind only');
  assert.equal(P(t, 3).missedBlinds, false);
});

test('without the flag the returning player posts at once', () => {
  const t = table(4);
  P(t, 3).sittingOut = true;
  t.button = 3; t.startHand();
  endHand(t);
  t.requestSitOut('p3', false);
  t.button = 3; t.startHand();
  assert.equal(P(t, 3).inHand, true);
  assert.equal(P(t, 3).lastAction.action, 'Post Blind(s)');
});

test('the flag shows on the own seat only', () => {
  const t = table(4);
  t.setWaitForBlinds('p1', true);
  assert.equal(t.snapshotFor('p1').players.find((p) => p.isMe).waitForBlinds, true);
  assert.equal(t.snapshotFor('p0').players.find((p) => p.id === 'p1').waitForBlinds, undefined);
});

test('the sit-out countdown runs twice as fast while players wait for a seat', () => {
  const t = table(3);
  t.requestSitOut('p1', true);
  t.refreshSitOutClocks(0, 0);
  t.refreshSitOutClocks(10_000, 1); // 10 s at normal speed, then a player starts waiting
  assert.equal(P(t, 1).kickOutAt, 10_000 + (SIT_OUT_KICK_MS - 10_000) / 2);
  t.refreshSitOutClocks(20_000, 0); // 10 s at double speed, then the queue empties
  assert.equal(P(t, 1).kickOutAt, 20_000 + (SIT_OUT_KICK_MS - 30_000));
  assert.deepEqual(t.expiredSitOuts(20_000 + SIT_OUT_KICK_MS - 30_000), ['p1']);
});

test('waiting players on alternating seats come back within an orbit (Codex review #59)', () => {
  const t = table(4);
  for (const i of [1, 3]) { P(t, i).sittingOut = true; }
  t.button = 3; t.startHand();
  endHand(t);
  for (const id of ['p1', 'p3']) { t.setWaitForBlinds(id, true); t.requestSitOut(id, false); }
  let back = false;
  for (let h = 0; h < 6 && !back; h++) {
    t.startHand();
    back = P(t, 1).inHand || P(t, 3).inHand;
    endHand(t);
  }
  assert.ok(back, 'a waiting player is dealt back in instead of waiting forever');
});

test('Post now restarts an idle table (Codex review #59)', () => {
  const t = new PokerTable({ id: 'wb2', name: 'Wb2', game: 'holdem', sb: 1, bb: 2, seats: 2, min_buyin: 10, max_buyin: 1000 });
  for (let i = 0; i < 2; i++) {
    t.seats[i].player = { id: 'q' + i, nick: 'Q' + i, stack: 100, isBot: false, sittingOut: false, inHand: false, cards: [], bet: 0, totalBet: 0 };
  }
  t.street = 'idle';
  const q1 = t.seats[1].player;
  Object.assign(q1, { missedBlinds: true, waitForBlinds: true });
  assert.equal(t.readySeats().length, 1, 'the waiting player is not ready');
  t.setWaitForBlinds('q1', false);
  assert.equal(t.street, 'preflop', 'Post now deals the next hand');
});
