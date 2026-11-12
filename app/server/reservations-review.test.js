// Review fixes for table reservations: a Rush player who reserved a leave is cashed out,
// never moved; the big-blind prediction counts an expired blind waiter being dealt back in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { createRushPool } from './rush-pool.js';
import { nextBigBlindSeat } from './reservations.js';

/** A Rush pool over fake tables; records seats taken through seatHuman. */
function rushWorld(tables) {
  const byId = new Map(tables.map((t) => [t.cfg.id, t]));
  const seated = [];
  const pool = createRushPool({
    listPoolTableIds: () => tables.map((t) => t.cfg.id),
    getLiveTable: (id) => byId.get(id) || null,
    getEntry: (id) => (byId.has(id) ? { table: byId.get(id), clients: [] } : undefined),
    findUser: (id) => ({ id, nick: `u${id}` }),
    cashOutSeat: (table, userId) => { table.seatOf(userId).player = null; },
    seatHuman: (table, user) => { seated.push({ userId: user.id, to: table.cfg.id }); return { ok: true }; },
    broadcastState: () => {},
    isRealUser: () => true,
    getSetting: (_k, fallback) => fallback,
    ledger: { hasDrop: () => false, credit: () => true },
  });
  return { pool, seated };
}

function fakeRushTable(id, players, seats = 6) {
  const seatList = Array.from({ length: seats }, (_, i) => ({ index: i, player: players[i] ? { ...players[i] } : null }));
  return {
    cfg: { id, game: 'rush', sb: 500, bb: 1000, seats, max_buyin: 100_000 },
    rush: true,
    street: 'ended',
    seats: seatList,
    humans() { return seatList.filter((s) => s.player && !s.player.isBot).map((s) => s.player); },
    seatOf(userId) { return seatList.find((s) => s.player?.id === userId) || null; },
    occupiedSeats() { return seatList.filter((s) => s.player); },
    emit() {},
  };
}

test('a Rush player who reserved a leave stays put for the leave sweep instead of moving', () => {
  const from = fakeRushTable('r1', [{ id: 1, stack: 50_000, rushQueued: true, leaveAfterHand: true }, { id: 90, stack: 50_000, isBot: true }]);
  const quiet = fakeRushTable('r2', []);
  const { pool, seated } = rushWorld([from, quiet]);
  pool.moveQueued(from);
  assert.deepEqual(seated, [], 'not transferred');
  assert.equal(from.seatOf(1).player.leaveAfterHand, true, 'reservation kept for the sweep');
  assert.equal(from.seatOf(1).player.rushQueued, false);
  assert.equal(pool.waitingList().length, 0, 'not parked in the pool queue either');
});

test('a queued Rush player who then reserves a leave is dropped from the pool queue', () => {
  const from = fakeRushTable('r1', [{ id: 1, stack: 50_000, rushQueued: true }, { id: 90, stack: 50_000, isBot: true }], 2);
  const full = fakeRushTable('r2', [{ id: 91, stack: 1, isBot: true }, { id: 92, stack: 1, isBot: true }], 2);
  const { pool, seated } = rushWorld([from, full]);
  pool.moveQueued(from); // pool full: player 1 waits
  assert.equal(pool.waitingList().length, 1);
  from.seatOf(1).player.leaveAfterHand = true;
  full.seats[1].player = null; // a seat opens
  pool.flush();
  assert.deepEqual(seated, [], 'the leaver is not seated elsewhere');
  assert.equal(pool.waitingList().length, 0);
});

test('the big-blind prediction counts a waiter dealt back in after a full orbit', () => {
  const t = new PokerTable({ id: 't', name: 'T', game: 'holdem', seats: 4, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9;
  t.saveHand = () => {};
  for (let i = 0; i < 4; i++) t.sit({ id: `P${i}`, nick: `P${i}` }, i, 1000);
  t.button = 3; // next hand: button P0, then P1, P2, P3
  // P1 waits for the big blind and has run out of orbit: startHand deals P1 in, as the SB.
  Object.assign(t.seatOf('P1').player, { waitForBlinds: true, missedBlinds: true, waitedHands: 4 });
  assert.equal(t.waitsForBigBlind(t.seatOf('P1').player), true, 'P1 is a blind waiter');
  assert.equal(nextBigBlindSeat(t).index, 2, 'P1 posts the small blind, P2 the big blind');
  t.setReservation('P2', 'sitOutNextBigBlind', true);
  t.nextHandAt = 0;
  t.startHand();
  assert.equal(t.seatOf('P1').player.inHand, true, 'the expired waiter was dealt in');
  assert.equal(t.seatOf('P2').player.inHand, false, 'P2 sat out instead of posting the big blind');
  assert.notEqual(t.bbSeat, 2);
});
