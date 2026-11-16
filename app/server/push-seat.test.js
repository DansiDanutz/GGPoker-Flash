import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PokerTable } from './table.js';
import { ensurePushSeatStore, grantPushSeat, reservePushSeat, cancelPushSeat, applyPushSeatReservations, pushSeatState } from './push-seat.js';

function fixture(ids = [1, 2, 3]) {
  const db = new DatabaseSync(':memory:');
  ensurePushSeatStore(db);
  const table = new PokerTable({ id: 'push-room', name: 'Push room', game: 'holdem', sb: 10, bb: 20, min_buyin: 100, max_buyin: 10000, seats: 6 });
  table.holdStart = true;
  ids.forEach((id, seat) => table.sit({ id, nick: `P${id}` }, seat, 1000 + id, `session-${id}`));
  table.street = 'idle';
  return { db, table };
}
function grant(db, accountId, expectedRevision = 0, uses = 1) {
  const result = grantPushSeat(db, { actorId: 99, roomId: 'push-room', accountId, uses, expectedRevision, operationId: `grant-${accountId}-${expectedRevision}` });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}
function reserve(db, table, actorId, destinationSeat, expectedRevision = 1, operationId = `reserve-${actorId}`) {
  return reservePushSeat(db, table, { actorId, destinationSeat, expectedRevision, operationId });
}

test('grant replacement is bounded and physical-seat reservation does not spend a use', () => {
  const { db, table } = fixture();
  const granted = grant(db, 1, 0, 3);
  assert.equal(granted.state.remaining, 3);
  assert.equal(granted.state.grantRevision, 1);
  const replaced = grant(db, 1, 1, 2);
  assert.equal(replaced.state.remaining, 2);
  assert.throws(() => grantPushSeat(db, { actorId: 99, roomId: 'push-room', accountId: 1, uses: 4, expectedRevision: 2, operationId: 'bad-grant' }), /1 to 3/);
  const reserved = reserve(db, table, 1, 4, 2);
  assert.equal(reserved.status, 200, JSON.stringify(reserved.body));
  assert.equal(reserved.body.state.remaining, 2);
  assert.equal(reserved.body.state.reservation.destinationSeat, 4);
  assert.equal(table.seatOf(1).index, 0);
  const cancelled = cancelPushSeat(db, table, { actorId: 1, expectedRevision: 3, operationId: 'cancel-1' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.state.remaining, 2);
  assert.equal(cancelled.body.state.reservation, null);
  assert.equal(cancelPushSeat(db, table, { actorId: 1, expectedRevision: 3, operationId: 'cancel-1' }).replayed, true);
});

test('two requests for one physical destination admit exactly one reservation', async () => {
  const { db, table } = fixture();
  grant(db, 1);
  grant(db, 2);
  const results = await Promise.all([reserve(db, table, 1, 3), reserve(db, table, 2, 3)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM push_seat_reservations WHERE status='reserved'").get().count, 1);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining + pushSeatState(db, 'push-room', 2).remaining, 2);
});

test('boundary confirmation swaps occupants and preserves stack, session, and physical blind positions', () => {
  const { db, table } = fixture();
  grant(db, 1);
  table.button = 2;
  table.sbSeat = 3;
  table.bbSeat = 4;
  table.street = 'preflop';
  assert.equal(reserve(db, table, 1, 2).status, 200);
  assert.deepEqual(applyPushSeatReservations(db, table), []);
  assert.equal(table.seatOf(1).index, 0);
  table.street = 'ended';
  const transitions = applyPushSeatReservations(db, table);
  assert.equal(transitions[0].status, 'completed', JSON.stringify(transitions));
  assert.equal(table.seatOf(1).index, 2);
  assert.equal(table.seatOf(3).index, 0);
  assert.equal(table.seatOf(1).player.stack, 1001);
  assert.equal(table.seatOf(3).player.stack, 1003);
  assert.equal(table.seatOf(1).player.sessionId, 'session-1');
  assert.equal(table.seatOf(3).player.sessionId, 'session-3');
  assert.deepEqual([table.button, table.sbSeat, table.bbSeat], [2, 3, 4]);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 0);
  assert.equal(reserve(db, table, 1, 5, 2, 'reserve-without-use').status, 409);
});

test('restart revalidates a reserved row and completes it without consuming two uses', () => {
  const { db, table } = fixture();
  grant(db, 1);
  assert.equal(reserve(db, table, 1, 5).status, 200);
  const restarted = new PokerTable({ id: 'push-room', name: 'Push room', game: 'holdem', sb: 10, bb: 20, min_buyin: 100, max_buyin: 10000, seats: 6 });
  restarted.holdStart = true;
  for (const seat of table.seats) if (seat.player) restarted.sit({ ...seat.player }, seat.index, seat.player.stack, seat.player.sessionId);
  restarted.street = 'idle';
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 1);
  assert.equal(applyPushSeatReservations(db, restarted)[0].status, 'completed');
  assert.equal(applyPushSeatReservations(db, restarted).length, 0);
  assert.equal(restarted.seatOf(1).index, 5);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 0);
});

test('persistence failure rolls back both seat movement and entitlement', () => {
  const { db, table } = fixture();
  grant(db, 1);
  assert.equal(reserve(db, table, 1, 2).status, 200);
  db.exec("CREATE TRIGGER fail_push_use BEFORE UPDATE ON push_seat_grants BEGIN SELECT RAISE(ABORT,'injected grant failure'); END");
  const before = table.seats.map((seat) => seat.player?.id || null);
  const transitions = applyPushSeatReservations(db, table);
  assert.equal(transitions[0].status, 'error');
  assert.deepEqual(table.seats.map((seat) => seat.player?.id || null), before);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 1);
});

test('a departed account expires the reservation without spending a use', () => {
  const { db, table } = fixture();
  grant(db, 1);
  assert.equal(reserve(db, table, 1, 2).status, 200);
  table.seats[2].player = null;
  const transitions = applyPushSeatReservations(db, table);
  assert.equal(transitions[0].status, 'expired', JSON.stringify(transitions));
  assert.equal(table.seatOf(1).index, 0);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 1);
});


test('receipt insertion failure restores the physical seat swap', () => {
  const { db, table } = fixture();
  grant(db, 1);
  assert.equal(reserve(db, table, 1, 2).status, 200);
  db.exec("CREATE TRIGGER reject_push_receipt BEFORE INSERT ON operation_receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END");
  const before = table.seats.map((seat) => seat.player?.id || null);
  const transitions = applyPushSeatReservations(db, table);
  assert.equal(transitions[0].status, 'error');
  assert.deepEqual(table.seats.map((seat) => seat.player?.id || null), before);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 1);
  assert.equal(pushSeatState(db, 'push-room', 1).reservation.status, 'reserved');
});

test('a later occupant expires an empty-seat reservation without moving either player', () => {
  const { db, table } = fixture([1, 2]);
  grant(db, 1);
  assert.equal(reserve(db, table, 1, 2).status, 200);
  table.sit({ id: 3, nick: 'P3' }, 2, 1003, 'session-3');
  const transitions = applyPushSeatReservations(db, table);
  assert.equal(transitions[0].status, 'expired');
  assert.equal(table.seatOf(1).index, 0);
  assert.equal(table.seatOf(3).index, 2);
  assert.equal(pushSeatState(db, 'push-room', 1).remaining, 1);
});
