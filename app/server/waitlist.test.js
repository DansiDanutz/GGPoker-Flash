import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWaitlist, join, leave, position, offer, accept, expire, groupKey,
  tableQueue, groupQueue, HOLD_MS, TABLE_CAP, GROUP_CAP, MAX_QUEUES_PER_PLAYER,
} from './waitlist.js';

const T = 'nlh-bronze-01';
const Q = tableQueue(T);

const joinAll = (state, users, target) => users.reduce((s, u) => join(s, u, target).state, state);

test('queues are FIFO and offers go to the head of the queue', () => {
  const s = joinAll(createWaitlist(), ['a', 'b', 'c'], { tableId: T });
  assert.deepEqual([position(s, 'a', Q), position(s, 'b', Q), position(s, 'c', Q)], [1, 2, 3]);
  const r = offer(s, T, 4, 1000);
  assert.equal(r.status, 'offered');
  assert.deepEqual(
    { tableId: r.offer.tableId, seat: r.offer.seat, userId: r.offer.userId, deadline: r.offer.deadline },
    { tableId: T, seat: 4, userId: 'a', deadline: 1000 + HOLD_MS },
  );
  assert.equal(position(r.state, 'b', Q), 1);
  assert.equal(position(r.state, 'a', Q), 0);
});

test('state is never mutated', () => {
  const s0 = createWaitlist();
  const s1 = join(s0, 'a', { tableId: T }).state;
  assert.deepEqual(s0.queues, {});
  const s2 = offer(s1, T, 0, 0).state;
  assert.deepEqual(s1.queues[Q], ['a']);
  assert.equal(s1.offers.length, 0);
  assert.equal(s2.offers.length, 1);
  assert.ok(Object.isFrozen(s2) && Object.isFrozen(s2.offers) && Object.isFrozen(s2.queues));
});

test('a duplicate join returns the existing position and the same state', () => {
  const s = joinAll(createWaitlist(), ['a', 'b'], { tableId: T });
  const r = join(s, 'a', { tableId: T });
  assert.equal(r.status, 'queued');
  assert.equal(r.position, 1);
  assert.equal(r.state, s);
});

test('a table queue at its cap returns full', () => {
  const users = Array.from({ length: TABLE_CAP }, (_, i) => `u${i}`);
  const s = joinAll(createWaitlist(), users, { tableId: T });
  const r = join(s, 'late', { tableId: T });
  assert.equal(r.status, 'full');
  assert.equal(r.state, s);
  assert.equal(position(s, 'late', Q), 0);
});

test('a group queue caps at 25 players', () => {
  const target = { groupKey: 'nlh:1/2:6', tables: [{ id: T, freeSeats: [] }] };
  const users = Array.from({ length: GROUP_CAP }, (_, i) => `u${i}`);
  const s = joinAll(createWaitlist(), users, target);
  assert.equal(position(s, `u${GROUP_CAP - 1}`, groupQueue('nlh:1/2:6')), GROUP_CAP);
  assert.equal(join(s, 'late', target).status, 'full');
});

test('a player can be in at most 4 queues at once', () => {
  const tables = Array.from({ length: MAX_QUEUES_PER_PLAYER + 1 }, (_, i) => `t${i}`);
  const s = tables.slice(0, -1).reduce((st, id) => join(st, 'a', { tableId: id }).state, createWaitlist());
  const r = join(s, 'a', { tableId: tables.at(-1) });
  assert.equal(r.status, 'limit');
  assert.equal(r.state, s);
});

test('an expired offer passes the seat to #2', () => {
  const s = joinAll(createWaitlist(), ['a', 'b', 'c'], { tableId: T });
  const offered = offer(s, T, 2, 0).state;
  const early = expire(offered, HOLD_MS - 1);
  assert.equal(early.state, offered);
  const r = expire(offered, HOLD_MS);
  assert.deepEqual(r.expired.map((o) => o.userId), ['a']);
  assert.equal(r.offers.length, 1);
  assert.equal(r.offers[0].userId, 'b');
  assert.equal(r.offers[0].seat, 2);
  assert.equal(r.offers[0].deadline, 2 * HOLD_MS);
  assert.equal(position(r.state, 'c', Q), 1);
  assert.equal(accept(r.state, 'a', T, HOLD_MS).status, 'none');
});

test('expiry with nobody left releases the hold', () => {
  const s = offer(join(createWaitlist(), 'a', { tableId: T }).state, T, 0, 0).state;
  const r = expire(s, HOLD_MS);
  assert.equal(r.offers.length, 0);
  assert.equal(r.state.offers.length, 0);
});

test('leaving during an offer releases the hold', () => {
  const s = offer(joinAll(createWaitlist(), ['a', 'b'], { tableId: T }), T, 3, 0).state;
  const r = leave(s, 'a', Q);
  assert.deepEqual(r.released.map((o) => [o.userId, o.seat]), [['a', 3]]);
  assert.equal(r.state.offers.length, 0);
  const again = offer(r.state, T, 3, 10);
  assert.equal(again.status, 'offered');
  assert.equal(again.offer.userId, 'b');
});

test('accept seats the holder within the deadline only', () => {
  const s = offer(join(createWaitlist(), 'a', { tableId: T }).state, T, 1, 0).state;
  assert.equal(accept(s, 'b', T, 1).status, 'none');
  assert.equal(accept(s, 'a', T, HOLD_MS).status, 'expired');
  const r = accept(s, 'a', T, HOLD_MS - 1);
  assert.equal(r.status, 'accepted');
  assert.equal(r.seat, 1);
  assert.equal(r.state.offers.length, 0);
});

test('a held seat cannot be offered twice and an empty queue offers nothing', () => {
  const s = offer(join(createWaitlist(), 'a', { tableId: T }).state, T, 1, 0).state;
  assert.equal(offer(s, T, 1, 0).status, 'held');
  assert.equal(offer(s, T, 2, 0).status, 'empty');
});

test('a group join resolves to the first free unheld table seat', () => {
  const key = 'nlh:1/2:6';
  const tables = [{ id: 't1', freeSeats: [] }, { id: 't2', freeSeats: [5] }, { id: 't3', freeSeats: [0] }];
  const r = join(createWaitlist(), 'a', { groupKey: key, tables });
  assert.deepEqual([r.status, r.tableId, r.seat], ['seat', 't2', 5]);
  assert.equal(r.state, createWaitlist());

  const held = offer(join(createWaitlist(), 'x', { tableId: 't2' }).state, 't2', 5, 0).state;
  const skip = join(held, 'a', { groupKey: key, tables });
  assert.deepEqual([skip.status, skip.tableId, skip.seat], ['seat', 't3', 0]);

  const full = join(createWaitlist(), 'a', { groupKey: key, tables: [{ id: 't1', freeSeats: [] }] });
  assert.equal(full.status, 'queued');
  assert.equal(position(full.state, 'a', groupQueue(key)), 1);
});

test('a table offer falls back to the group queue and expiry stays in that queue', () => {
  const key = 'nlh:1/2:6';
  const s = joinAll(createWaitlist(), ['g1', 'g2'], { groupKey: key, tables: [] });
  const r = offer(s, 't1', 0, 0, { groupKey: key });
  assert.equal(r.offer.userId, 'g1');
  assert.equal(expire(r.state, HOLD_MS).offers[0].userId, 'g2');
});

test('groupKey combines game, stakes and seats', () => {
  assert.equal(groupKey({ game: 'nlh', sb: 1, bb: 2, seats: 6 }), 'nlh:1/2:6');
  assert.notEqual(groupKey({ game: 'nlh', sb: 1, bb: 2, seats: 9 }), groupKey({ game: 'nlh', sb: 1, bb: 2, seats: 6 }));
});
