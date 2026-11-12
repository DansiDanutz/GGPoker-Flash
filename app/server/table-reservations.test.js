// Table reservations: "Fold to any bet" (client pre-action), "Leave table after this hand",
// "Sit out next big blind" and "Sit out at all tables" (server-authoritative seat flags).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { nextBigBlindSeat, pendingLeaves, sitOutEverywhere } from './reservations.js';
import { resolvePreAction, keepPreAction } from '../src/game/preAction.ts';

function table(seats = 4) {
  const t = new PokerTable({ id: 't', name: 'T', game: 'holdem', seats, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9; // deal only when the test says so
  t.saveHand = () => {};
  return t;
}

function seated(n = 4) {
  const t = table(n);
  for (let i = 0; i < n; i++) t.sit({ id: `P${i}`, nick: `P${i}` }, i, 1000);
  return t;
}

const deal = (t) => { t.nextHandAt = 0; t.startHand(); };
const player = (t, id) => t.seatOf(id).player;

/* ---------------------------- fold to any bet ---------------------------- */

test('fold to any bet folds facing a bet and clears itself', () => {
  assert.deepEqual(resolvePreAction({ kind: 'foldany' }, 50), { action: 'fold', next: null });
});

test('fold to any bet checks when checking is free and stays active', () => {
  assert.deepEqual(resolvePreAction({ kind: 'foldany' }, 0), { action: 'check', next: { kind: 'foldany' } });
});

test('the one-shot pre-actions resolve once and clear', () => {
  assert.deepEqual(resolvePreAction({ kind: 'checkfold' }, 20), { action: 'fold', next: null });
  assert.deepEqual(resolvePreAction({ kind: 'checkfold' }, 0), { action: 'check', next: null });
  assert.deepEqual(resolvePreAction({ kind: 'check' }, 0), { action: 'check', next: null });
  assert.deepEqual(resolvePreAction({ kind: 'check' }, 20), { action: null, next: null });
  assert.deepEqual(resolvePreAction({ kind: 'call', amount: 20 }, 20), { action: 'call', next: null });
  assert.deepEqual(resolvePreAction({ kind: 'call', amount: 20 }, 40), { action: null, next: null });
  assert.deepEqual(resolvePreAction(null, 20), { action: null, next: null });
});

test('fold to any bet survives a price change; a queued call or check does not', () => {
  assert.deepEqual(keepPreAction({ kind: 'foldany' }, 300), { kind: 'foldany' });
  assert.equal(keepPreAction({ kind: 'call', amount: 20 }, 40), null);
  assert.equal(keepPreAction({ kind: 'check' }, 40), null);
  assert.deepEqual(keepPreAction({ kind: 'call', amount: 40 }, 40), { kind: 'call', amount: 40 });
  assert.deepEqual(keepPreAction({ kind: 'checkfold' }, 40), { kind: 'checkfold' });
});

/* ------------------------- sit out next big blind ------------------------ */

test('a seat with "sit out next big blind" sits out instead of posting the big blind', () => {
  const t = seated(4);
  t.button = 3; // next hand: button P0, small blind P1, big blind P2
  assert.equal(nextBigBlindSeat(t).index, 2);
  assert.equal(t.setReservation('P2', 'sitOutNextBigBlind', true).ok, true);
  deal(t);
  const p2 = player(t, 'P2');
  assert.equal(p2.sittingOut, true);
  assert.equal(p2.inHand, false);
  assert.equal(p2.sitOutNextBigBlind, false, 'the reservation is used up');
  assert.notEqual(t.bbSeat, 2, 'the big blind moves on to the next player');
  assert.equal(t.street, 'preflop');
});

test('"sit out next big blind" waits while the big blind is elsewhere', () => {
  const t = seated(4);
  t.button = 3; // big blind P2 this hand
  t.setReservation('P0', 'sitOutNextBigBlind', true);
  deal(t);
  const p0 = player(t, 'P0');
  assert.equal(p0.sittingOut, false);
  assert.equal(p0.inHand, true);
  assert.equal(p0.sitOutNextBigBlind, true);
});

test('heads-up: the non-button seat is the next big blind', () => {
  const t = seated(2);
  t.button = 1; // next hand: button P0 (small blind), big blind P1
  assert.equal(nextBigBlindSeat(t).index, 1);
});

test('cancelling "sit out next big blind" keeps the player in', () => {
  const t = seated(4);
  t.button = 3;
  t.setReservation('P2', 'sitOutNextBigBlind', true);
  t.setReservation('P2', 'sitOutNextBigBlind', false);
  deal(t);
  assert.equal(player(t, 'P2').inHand, true);
  assert.equal(t.bbSeat, 2);
});

/* ------------------------ leave table after the hand ---------------------- */

test('"leave after this hand" waits for the hand to end, then lists the seat', () => {
  const t = seated(3);
  t.button = 2;
  deal(t);
  t.setReservation('P0', 'leaveAfterHand', true);
  assert.deepEqual(pendingLeaves(t), [], 'still in the live hand');
  t.act(t.actor, 'fold');
  t.act(t.actor, 'fold');
  assert.equal(t.street, 'ended');
  assert.deepEqual(pendingLeaves(t), ['P0']);
});

test('a player who reserved the leave is not dealt into the next hand', () => {
  const t = seated(3);
  t.setReservation('P1', 'leaveAfterHand', true);
  deal(t);
  assert.equal(player(t, 'P1').inHand, false);
  assert.deepEqual(pendingLeaves(t), ['P1']);
});

test('a cancelled leave reservation keeps the seat', () => {
  const t = seated(3);
  t.setReservation('P1', 'leaveAfterHand', true);
  t.setReservation('P1', 'leaveAfterHand', false);
  assert.deepEqual(pendingLeaves(t), []);
});

test('reservations are refused for unknown kinds, watchers and elimination formats', () => {
  const t = seated(3);
  assert.equal(t.setReservation('P0', 'stack', 1e9).ok, false);
  assert.equal(t.setReservation('nobody', 'leaveAfterHand', true).ok, false);
  t.tournament = { mode: 'mtt' };
  assert.equal(t.setReservation('P0', 'leaveAfterHand', true).ok, false);
});

test('reservation flags appear only in the owner\'s view', () => {
  const t = seated(3);
  t.setReservation('P0', 'leaveAfterHand', true);
  t.setReservation('P0', 'sitOutNextBigBlind', true);
  const mine = t.snapshotFor('P0').players.find((p) => p.id === 'P0');
  assert.equal(mine.leaveAfterHand, true);
  assert.equal(mine.sitOutNextBigBlind, true);
  const theirs = t.snapshotFor('P1').players.find((p) => p.id === 'P0');
  assert.equal(theirs.leaveAfterHand, undefined);
});

/* -------------------------- sit out at all tables ------------------------- */

test('"sit out at all tables" sits the player out at every table they are seated at', () => {
  const a = seated(3);
  const b = seated(3);
  const c = seated(3);
  c.stand('P0');
  a.button = 2;
  deal(a); // P0 is in a live hand at table A
  const res = sitOutEverywhere([a, b, c], 'P0', true);
  assert.equal(res.tables, 2);
  assert.equal(player(a, 'P0').sitOutNextHand, true, 'live hand: sits out next hand');
  assert.equal(player(b, 'P0').sittingOut, true, 'idle table: sits out now');
  assert.equal(player(a, 'P0').sitOutAll, true);
  assert.equal(player(b, 'P0').sitOutAll, true);
});

test('cancelling "sit out at all tables" deals the player back in everywhere', () => {
  const a = seated(3);
  const b = seated(3);
  sitOutEverywhere([a, b], 'P0', true);
  const res = sitOutEverywhere([a, b], 'P0', false);
  assert.deepEqual(res.errors, []);
  for (const t of [a, b]) {
    const p = player(t, 'P0');
    assert.equal(p.sittingOut, false);
    assert.equal(p.sitOutNextHand, false);
    assert.equal(p.sitOutAll, false);
  }
});

test('sitting back in at one table clears that table\'s all-tables mark', () => {
  const a = seated(3);
  sitOutEverywhere([a], 'P0', true);
  a.requestSitOut('P0', false);
  assert.equal(player(a, 'P0').sitOutAll, false);
});
