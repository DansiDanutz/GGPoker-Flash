// Native sit-out (REA straddle-sitout.json): NotifyTableSitOut carries KickOutTime; at zero the
// server removes the seat (ELeaveSeatReason.SitOutTimeExpired). Deal Me In needs at least
// dealMeInMin = 2x BB when no DealMin is set, otherwise Get Chips opens. 2:00 is the observed
// countdown on a live $1/$2 cash table (the default is not in the client).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { SIT_OUT_KICK_MS, dealMeInMin } from './sitOut.js';

function table(cfg = {}) {
  const t = new PokerTable({ id: 'so', name: 'So', game: 'holdem', sb: 1, bb: 2, seats: 3, min_buyin: 10, max_buyin: 1000, ...cfg });
  for (let i = 0; i < 3; i++) {
    t.seats[i].player = {
      id: 'p' + i, nick: 'P' + i, avatar: '', stack: 100, isBot: false, sittingOut: false, disconnected: false,
      inHand: false, folded: false, allIn: false, bet: 0, totalBet: 0, cards: [], acted: false, reveal: false,
      lastAction: null, winAmount: 0, seat: i, timeBank: 30, joinedAt: Date.now(), handsPlayed: 0, won: 0,
    };
  }
  t.street = 'idle';
  return t;
}

test('the observed default countdown is two minutes', () => {
  assert.equal(SIT_OUT_KICK_MS, 120_000);
});

test('dealMeInMin is twice the big blind without a table minimum', () => {
  assert.equal(dealMeInMin({ bb: 2 }), 4);
  assert.equal(dealMeInMin({ bb: 2, dealMin: 10 }), 10);
});

test('sitting out starts the countdown and the own snapshot shows it', () => {
  const t = table();
  t.requestSitOut('p1', true);
  t.refreshSitOutClocks(1000);
  assert.equal(t.seats[1].player.kickOutAt, 1000 + SIT_OUT_KICK_MS);
  const me = t.snapshotFor('p1').players.find((p) => p.isMe);
  assert.equal(me.sitOutEndsAt, 1000 + SIT_OUT_KICK_MS);
  const other = t.snapshotFor('p0').players.find((p) => p.id === 'p1');
  assert.equal(other.sitOutEndsAt, undefined);
});

test('coming back clears the countdown', () => {
  const t = table();
  t.requestSitOut('p1', true);
  t.refreshSitOutClocks(1000);
  t.requestSitOut('p1', false);
  t.refreshSitOutClocks(2000);
  assert.equal(t.seats[1].player.kickOutAt, 0);
});

test('an expired sit-out is listed for removal, a running one is not', () => {
  const t = table();
  t.requestSitOut('p1', true);
  t.refreshSitOutClocks(1000);
  assert.deepEqual(t.expiredSitOuts(1000 + SIT_OUT_KICK_MS - 1), []);
  assert.deepEqual(t.expiredSitOuts(1000 + SIT_OUT_KICK_MS), ['p1']);
});

test('tournaments never run the cash sit-out clock', () => {
  const t = table();
  t.tournament = { level: 1 };
  t.requestSitOut('p1', true);
  t.refreshSitOutClocks(1000);
  assert.ok(!t.seats[1].player.kickOutAt);
  assert.deepEqual(t.expiredSitOuts(10_000_000), []);
});

test('Deal Me In is refused below dealMeInMin', () => {
  const t = table();
  t.requestSitOut('p1', true);
  t.seats[1].player.stack = 3;
  const res = t.requestSitOut('p1', false);
  assert.equal(res.ok, false);
  assert.match(res.error, /chips/i);
  assert.equal(t.seats[1].player.sittingOut, true);
});
