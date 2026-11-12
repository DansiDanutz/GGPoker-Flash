import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeReservations, reserve, RESERVE_MS, withoutPlayer } from './seatReserve.js';
import { PokerTable } from './table.js';

test('reserve: an empty seat is held for one player until it expires', () => {
  const first = reserve(new Map(), { seat: 2, playerId: 'a', now: 1000, seatEmpty: true });
  assert.equal(first.ok, true);
  assert.equal(first.until, 1000 + RESERVE_MS);
  const other = reserve(first.reservations, { seat: 2, playerId: 'b', now: 2000, seatEmpty: true });
  assert.deepEqual(other, { ok: false, error: 'seat reserved' });
  const later = reserve(first.reservations, { seat: 2, playerId: 'b', now: 1000 + RESERVE_MS, seatEmpty: true });
  assert.equal(later.ok, true, 'an expired reservation can be taken');
});

test('reserve: a player keeps at most one reservation; occupied seats cannot be reserved', () => {
  const a1 = reserve(new Map(), { seat: 1, playerId: 'a', now: 0, seatEmpty: true });
  const a2 = reserve(a1.reservations, { seat: 3, playerId: 'a', now: 0, seatEmpty: true });
  assert.deepEqual([...a2.reservations.keys()], [3]);
  assert.deepEqual(reserve(new Map(), { seat: 0, playerId: 'a', now: 0, seatEmpty: false }), { ok: false, error: 'seat taken' });
  assert.equal(activeReservations(a2.reservations, RESERVE_MS + 1).size, 0);
  assert.equal(withoutPlayer(a2.reservations, 'a').size, 0);
});

function table() {
  return new PokerTable({ id: 'rs', name: 'RS', game: 'holdem', sb: 50, bb: 100, seats: 3, min_buyin: 1000, max_buyin: 5000 });
}

test('table: a reserved seat is taken for others and bots, free for its holder, and shows R', () => {
  const t = table();
  assert.equal(t.reserveSeat(1, 'u1').ok, true);
  assert.equal(t.sit({ id: 'u2', nick: 'B' }, 1, 1000).ok, false);
  assert.notEqual(t.freeSeatFor('u2')?.index, 1);
  t.fillBots(3);
  assert.equal(t.seats[1].player, null, 'bots never take a reserved seat');
  const forOther = t.snapshotFor('u2').players[1];
  assert.deepEqual([forOther.empty, forOther.reserved, forOther.mine], [true, true, false]);
  assert.equal(t.snapshotFor('u1').players[1].mine, true);
  assert.equal(t.sit({ id: 'u1', nick: 'A' }, 1, 1000).ok, true);
  assert.equal(t.reservations.size, 0, 'sitting down uses the reservation');
});

test('table: reservations lapse on tick and can be cancelled', () => {
  const t = table();
  t.reserveSeat(0, 'u1', 0);
  t.expireReservations(RESERVE_MS + 1);
  assert.equal(t.reservations.size, 0);
  t.reserveSeat(0, 'u1');
  t.cancelReservation('u1');
  assert.equal(t.reservations.size, 0);
});
