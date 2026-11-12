// Add Chips during a hand (REA F14) and Remove Chips (REA F15): a pending top-up is paid now
// and lands at the next deal; surplus chips go back to the wallet between hands. Every wallet
// move carries an idempotent ledger reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import {
  addChipsLimits, removeChipsLimits, autoReduceOptions, setPendingTopUp, settlePendingTopUp,
  refundPendingTopUp, cancelPendingTopUp, removeChips, setAutoReduce, applyAutoReduce, inLiveHand,
  settleBeforeDeal,
} from './chip-moves.js';
import * as client from '../src/game/chipMoves.ts';

const CFG = { id: 't', name: 't', game: 'holdem', seats: 3, sb: 5, bb: 10, min_buyin: 400, max_buyin: 1000, rakePercent: 0 };

/** In-memory ledger with the same skip-on-duplicate contract as addTransactionEx. */
function fakeLedger(start = 10000) {
  const rows = [];
  const refs = new Set();
  const state = { balance: start };
  const write = ({ kind, amount, memo, reference }) => {
    if (refs.has(reference)) return { applied: false, balance: state.balance };
    refs.add(reference);
    rows.push({ kind, amount, memo, reference });
    state.balance += amount;
    return { applied: true, balance: state.balance };
  };
  return { rows, write, state };
}

const seated = (stack, extra = {}) => ({ id: 'A', stack, sessionId: 't:s1', inHand: false, folded: true, ...extra });

/* ------------------------------- limits ------------------------------- */

test('add-chips limits: max is min(table max - stack - pending, wallet); min is clamped to max', () => {
  assert.deepEqual(addChipsLimits({ stack: 300, pending: 0, minBuyin: 400, maxBuyin: 1000, balance: 5000 }), { min: 100, max: 700 });
  assert.deepEqual(addChipsLimits({ stack: 300, pending: 200, minBuyin: 400, maxBuyin: 1000, balance: 5000 }), { min: 0, max: 500 });
  assert.deepEqual(addChipsLimits({ stack: 600, pending: 0, minBuyin: 400, maxBuyin: 1000, balance: 5000 }), { min: 0, max: 400 },
    'a stack above the minimum may add zero');
  assert.deepEqual(addChipsLimits({ stack: 0, pending: 0, minBuyin: 400, maxBuyin: 1000, balance: 150 }), { min: 150, max: 150 },
    'a short wallet clamps the minimum down to what is available');
  assert.deepEqual(addChipsLimits({ stack: 1000, pending: 0, minBuyin: 400, maxBuyin: 1000, balance: 5000 }), { min: 0, max: 0 });
});

test('remove-chips limits: only the surplus above the table minimum buy-in', () => {
  assert.deepEqual(removeChipsLimits({ stack: 1500, minBuyin: 400 }), { min: 0, max: 1100 });
  assert.deepEqual(removeChipsLimits({ stack: 300, minBuyin: 400 }), { min: 0, max: 0 });
});

test('auto-reduce targets run in 10 BB steps from the table minimum up to min(max, 200 BB)', () => {
  assert.deepEqual(autoReduceOptions({ minBuyin: 400, maxBuyin: 1000, bb: 10 }), [40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(autoReduceOptions({ minBuyin: 250, maxBuyin: 1000, bb: 10 }), [30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(autoReduceOptions({ minBuyin: 400, maxBuyin: 100000, bb: 10 }).at(-1), 200);
  assert.deepEqual(autoReduceOptions({ minBuyin: 400, maxBuyin: 1000, bb: 0 }), []);
});

test('client and server agree on every limit', () => {
  for (const stack of [0, 150, 400, 999, 1000, 1500]) {
    for (const pending of [0, 100]) {
      for (const balance of [0, 50, 10000]) {
        const args = { stack, pending, minBuyin: 400, maxBuyin: 1000, balance };
        assert.deepEqual(client.addChipsLimits(args), addChipsLimits(args));
      }
    }
    assert.deepEqual(client.removeChipsLimits({ stack, minBuyin: 400 }), removeChipsLimits({ stack, minBuyin: 400 }));
  }
  assert.deepEqual(client.autoReduceOptions({ minBuyin: 250, maxBuyin: 5000, bb: 10 }), autoReduceOptions({ minBuyin: 250, maxBuyin: 5000, bb: 10 }));
});

/* ---------------------------- pending top-up --------------------------- */

test('a pending top-up debits the wallet now and is applied at the next deal', () => {
  const ledger = fakeLedger();
  const p = seated(500);
  const res = setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: ledger.state.balance, ledger: ledger.write });
  assert.equal(res.ok, true);
  assert.equal(p.pendingTopUp, 300);
  assert.equal(p.stack, 500, 'the live stack is untouched');
  assert.equal(ledger.state.balance, 9700);
  assert.deepEqual(ledger.rows.map((r) => [r.kind, r.amount, r.reference]), [['rebuy', -300, 'topup:t:s1:1']]);
  assert.equal(settlePendingTopUp({ player: p, maxBuyin: 1000, ledger: ledger.write }), 300);
  assert.equal(p.stack, 800);
  assert.equal(p.pendingTopUp, 0);
  assert.equal(ledger.rows.length, 1, 'applying moves no money');
});

test('a new request replaces the pending top-up; only the difference moves', () => {
  const ledger = fakeLedger();
  const p = seated(500);
  const set = (total) => setPendingTopUp({ player: p, total, minBuyin: 400, maxBuyin: 1000, balance: ledger.state.balance, ledger: ledger.write });
  set(300);
  assert.equal(set(450).ok, true);
  assert.equal(p.pendingTopUp, 450);
  assert.equal(ledger.state.balance, 9550);
  assert.equal(set(100).ok, true);
  assert.equal(p.pendingTopUp, 100);
  assert.equal(ledger.state.balance, 9900);
  assert.deepEqual(ledger.rows.map((r) => [r.kind, r.amount, r.reference]), [
    ['rebuy', -300, 'topup:t:s1:1'], ['rebuy', -150, 'topup:t:s1:2'], ['chips_refund', 350, 'topup:t:s1:3'],
  ]);
  assert.equal(cancelPendingTopUp({ player: p, ledger: ledger.write }).ok, true);
  assert.equal(p.pendingTopUp, 0);
  assert.equal(ledger.state.balance, 10000, 'cancelling refunds the rest');
});

test('the same total twice is a no-op (a replayed request never charges twice)', () => {
  const ledger = fakeLedger();
  const p = seated(500);
  const args = { player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write };
  setPendingTopUp(args);
  const again = setPendingTopUp({ ...args, balance: ledger.state.balance });
  assert.equal(again.ok, true);
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.state.balance, 9700);
});

test('stack + pending can never exceed the table maximum, at request time or at the deal', () => {
  const ledger = fakeLedger();
  const p = seated(800);
  const over = setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write });
  assert.equal(over.ok, false);
  assert.equal(ledger.rows.length, 0);
  assert.equal(setPendingTopUp({ player: p, total: 200, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write }).ok, true);
  p.stack = 950; // won a pot before the next deal
  assert.equal(settlePendingTopUp({ player: p, maxBuyin: 1000, ledger: ledger.write }), 50);
  assert.equal(p.stack, 1000);
  assert.equal(ledger.state.balance, 10000 - 200 + 150, 'the part over the maximum goes back to the wallet');
  assert.deepEqual(ledger.rows.at(-1), { kind: 'chips_refund', amount: 150, memo: 'Pending chips over the table maximum', reference: 'topup:t:s1:1:cap' });
});

test('a keyed charge already paid (e.g. as a between-hands rebuy) is a duplicate, not a second charge', () => {
  const ledger = fakeLedger();
  ledger.write({ kind: 'rebuy', amount: -300, memo: 'Rebuy', reference: 'in:t:s1:k:abc' });
  const p = seated(500);
  const res = setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: ledger.state.balance, ledger: ledger.write, chargeReference: 'in:t:s1:k:abc' });
  assert.equal(res.ok, false);
  assert.equal(res.duplicate, true);
  assert.equal(p.pendingTopUp, undefined, 'nothing is queued');
  assert.equal(ledger.state.balance, 9700, 'paid once');
});

test('a pending top-up needs the wallet to cover the difference and whole chips', () => {
  const ledger = fakeLedger(100);
  const p = seated(500);
  assert.equal(setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: 100, ledger: ledger.write }).ok, false);
  assert.equal(setPendingTopUp({ player: p, total: 1.5, minBuyin: 400, maxBuyin: 1000, balance: 100, ledger: ledger.write }).ok, false);
  assert.equal(setPendingTopUp({ player: p, total: -5, minBuyin: 400, maxBuyin: 1000, balance: 100, ledger: ledger.write }).ok, false);
  assert.equal(ledger.rows.length, 0);
});

test('a short stack must top up to the table minimum (or all the wallet holds)', () => {
  const ledger = fakeLedger();
  const p = seated(100);
  assert.equal(setPendingTopUp({ player: p, total: 200, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write }).ok, false);
  assert.equal(setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write }).ok, true);
});

test('leaving before the next deal refunds the pending top-up exactly once', () => {
  const ledger = fakeLedger();
  const p = seated(500);
  setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write });
  assert.equal(refundPendingTopUp({ player: p, ledger: ledger.write }), 300);
  assert.equal(refundPendingTopUp({ player: p, ledger: ledger.write }), 0);
  assert.equal(ledger.state.balance, 10000);
  assert.deepEqual(ledger.rows.at(-1), { kind: 'chips_refund', amount: 300, memo: 'Pending chips refund (left the table)', reference: 'topup:t:s1:1:leave' });
});

/* ------------------------------ remove chips ---------------------------- */

test('remove chips returns the surplus to the wallet with an idempotent reference', () => {
  const ledger = fakeLedger(0);
  const table = new PokerTable(CFG);
  const p = seated(1500);
  const res = removeChips({ table, player: p, amount: 600, key: 'abc', ledger: ledger.write });
  assert.equal(res.ok, true);
  assert.equal(p.stack, 900);
  assert.deepEqual(ledger.rows, [{ kind: 'remove_chips', amount: 600, memo: 'Remove chips', reference: 'remove:t:s1:abc' }]);
  const replay = removeChips({ table, player: p, amount: 600, key: 'abc', ledger: ledger.write });
  assert.equal(replay.ok, false, 'a replayed request is rejected');
  assert.equal(p.stack, 900, 'and removes nothing');
  assert.equal(ledger.state.balance, 600);
});

test('remove chips never goes below the table minimum buy-in', () => {
  const ledger = fakeLedger(0);
  const table = new PokerTable(CFG);
  const p = seated(500);
  assert.equal(removeChips({ table, player: p, amount: 101, ledger: ledger.write }).ok, false);
  assert.equal(removeChips({ table, player: p, amount: 0, ledger: ledger.write }).ok, false);
  assert.equal(removeChips({ table, player: p, amount: 2.5, ledger: ledger.write }).ok, false);
  assert.equal(removeChips({ table, player: p, amount: 100, ledger: ledger.write }).ok, true);
  assert.equal(p.stack, 400);
  assert.equal(removeChips({ table, player: p, amount: 1, ledger: ledger.write }).ok, false);
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0].reference, 'remove:t:s1:1', 'without a key the seat counter names the move');
});

test('remove chips is refused during a live hand and while a top-up is pending', () => {
  const ledger = fakeLedger(0);
  const table = new PokerTable(CFG);
  table.street = 'flop';
  const live = seated(1500, { inHand: true, folded: false });
  assert.equal(inLiveHand(table, live), true);
  assert.equal(removeChips({ table, player: live, amount: 100, ledger: ledger.write }).ok, false);
  const folded = seated(1500, { inHand: true, folded: true });
  assert.equal(removeChips({ table, player: folded, amount: 100, ledger: ledger.write }).ok, true, 'a folded seat is not in a live hand');
  table.street = 'ended';
  const pending = seated(1500, { pendingTopUp: 50 });
  assert.equal(removeChips({ table, player: pending, amount: 100, ledger: ledger.write }).ok, false);
});

test('always reduce my stack to N BB: validated setting, applied before the deal once per hand', () => {
  const ledger = fakeLedger(0);
  const p = seated(1000);
  assert.equal(setAutoReduce({ player: p, value: 35, minBuyin: 400, maxBuyin: 1000, bb: 10 }).ok, false, 'not a listed step');
  assert.equal(setAutoReduce({ player: p, value: 50, minBuyin: 400, maxBuyin: 1000, bb: 10 }).ok, true);
  assert.equal(p.autoReduceBB, 50);
  assert.equal(applyAutoReduce({ player: p, bb: 10, minBuyin: 400, handNo: 7, ledger: ledger.write }), 500);
  assert.equal(p.stack, 500);
  assert.equal(applyAutoReduce({ player: p, bb: 10, minBuyin: 400, handNo: 7, ledger: ledger.write }), 0);
  assert.deepEqual(ledger.rows, [{ kind: 'remove_chips', amount: 500, memo: 'Auto reduce stack', reference: 'remove:t:s1:auto:7' }]);
  assert.equal(setAutoReduce({ player: p, value: null, minBuyin: 400, maxBuyin: 1000, bb: 10 }).ok, true);
  assert.equal(p.autoReduceBB, 0);
});

/* --------------------------- table integration -------------------------- */

function liveTable(hooks) {
  const t = new PokerTable(CFG, hooks);
  t.saveHand = () => {};
  t.sit({ id: 'A', nick: 'A' }, 0, 500, 't:sA');
  t.sit({ id: 'B', nick: 'B' }, 1, 500, 't:sB');
  t.nextHandAt = 0;
  if (t.street !== 'preflop') t.startHand();
  return t;
}

test('the table settles pending top-ups through beforeDeal before dealing the next hand', () => {
  const ledger = fakeLedger();
  const hooks = {
    beforeDeal: (table) => {
      for (const pl of table.humans()) settlePendingTopUp({ player: pl, maxBuyin: table.cfg.max_buyin, ledger: ledger.write });
    },
  };
  const t = liveTable(hooks);
  const a = t.seatOf('A').player;
  assert.equal(t.handInProgress(), true);
  setPendingTopUp({ player: a, total: 200, minBuyin: 400, maxBuyin: 1000, balance: ledger.state.balance, ledger: ledger.write });
  const handNo = t.handNo;
  const before = a.stack;
  t.act(t.actor, 'fold');
  assert.equal(t.handInProgress(), false);
  assert.equal(a.pendingTopUp, 200, 'still pending until the next deal');
  t.nextHandAt = 1; // due now
  t.tick(Date.now());
  assert.equal(t.handNo, handNo + 1);
  assert.equal(a.pendingTopUp, 0);
  assert.ok(a.stack + a.totalBet >= before + 200 - 10, 'the top-up landed in the new hand');
  assert.equal(t.snapshotFor('A').players[0].pendingTopUp, 0);
});

test('a bust with chips pending is not offered a reload window', () => {
  const t = new PokerTable(CFG);
  t.sit({ id: 'A', nick: 'A' }, 0, 500, 't:sA');
  const a = t.seatOf('A').player;
  a.stack = 0;
  a.pendingTopUp = 400;
  assert.equal(t.openRebuyWindow(Date.now()), false);
});

test('pending chips are private to their owner in the snapshot', () => {
  const t = new PokerTable(CFG);
  t.sit({ id: 'A', nick: 'A' }, 0, 500, 't:sA');
  t.sit({ id: 'B', nick: 'B' }, 1, 500, 't:sB');
  t.seatOf('A').player.pendingTopUp = 250;
  t.seatOf('A').player.autoReduceBB = 60;
  const own = t.snapshotFor('A').players.find((p) => p.id === 'A');
  const other = t.snapshotFor('B').players.find((p) => p.id === 'A');
  assert.equal(own.pendingTopUp, 250);
  assert.equal(own.autoReduceBB, 60);
  assert.equal(other.pendingTopUp, undefined);
  assert.equal(other.autoReduceBB, undefined);
});

test('a seat reserved to leave after the hand keeps its pending chips for the refund, not the stack', () => {
  const ledger = fakeLedger();
  const p = seated(500, { leaveAfterHand: true, autoReduceBB: 40 });
  setPendingTopUp({ player: p, total: 300, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write });
  settleBeforeDeal({ player: p, bb: 10, minBuyin: 400, maxBuyin: 1000, handNo: 3, ledger: ledger.write });
  assert.equal(p.stack, 500, 'nothing lands on a leaving seat');
  assert.equal(p.pendingTopUp, 300);
  assert.equal(refundPendingTopUp({ player: p, ledger: ledger.write }), 300);
  assert.equal(ledger.state.balance, 10000);
});

test('before a deal, auto-reduce runs first and then the pending top-up lands', () => {
  const ledger = fakeLedger();
  const p = seated(900, { autoReduceBB: 50 });
  setPendingTopUp({ player: p, total: 100, minBuyin: 400, maxBuyin: 1000, balance: 10000, ledger: ledger.write });
  settleBeforeDeal({ player: p, bb: 10, minBuyin: 400, maxBuyin: 1000, handNo: 3, ledger: ledger.write });
  assert.equal(p.stack, 600);
  assert.equal(p.pendingTopUp, 0);
});
