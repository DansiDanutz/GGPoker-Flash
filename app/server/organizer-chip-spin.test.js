// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerChipSpin, MAX_MULTIPLIER } from './organizer-chip-spin.js';
import { organizerSpinOutcome } from './organizer-spin-prizes.js';
import { spinPayouts } from './spin.js';

const STAKE = 5000;
function fixture(seed = STAKE * 3, rakePercent = 5) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES (1,0,NULL),(2,0,NULL),(3,0,NULL),(4,0,NULL);
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2099-01-01T00:00:00.000Z');
    CREATE TABLE tables(id TEXT PRIMARY KEY,game TEXT,owner_id INTEGER,private INTEGER,chip_economy INTEGER,min_buyin INTEGER,max_buyin INTEGER,rake_percent INTEGER);
    INSERT INTO tables VALUES ('spin:1','spingold',1,1,1,5000,5000,${rakePercent});
  `);
  const chips = createOrganizerChips({ db });
  db.prepare("INSERT INTO organizer_chip_accounts VALUES (1,'wallet:1',?)").run(seed);
  db.prepare("INSERT INTO organizer_chip_journals(organizer_id,kind,reference,payload,from_account,to_account,amount,created_at) VALUES (1,'test_seed','seed','{}',NULL,'wallet:1',?,datetime('now'))").run(seed);
  const spin = createOrganizerChipSpin({ db, chips });
  return { db, chips, spin };
}
function fundSeats(f) {
  for (const userId of [2, 3, 4]) {
    f.chips.transfer({ organizerId: 1, fromUserId: 1, toUserId: userId, amount: STAKE, idempotencyKey: `fund-${userId}` });
    f.chips.openSeat({ organizerId: 1, userId, tableId: 'spin:1', sessionId: `round:seat:${userId}`, amount: STAKE });
  }
}
const players = () => [2, 3, 4].map((userId) => ({ userId, sessionId: `round:seat:${userId}`, amount: STAKE }));
const outcome = (multiplier) => spinPayouts(STAKE).find((row) => row.multiplier === multiplier);

test('pooled outcome rejects unsupported stakes and rake as client errors', () => {
  for (const args of [[1, 5], [STAKE, 1], [STAKE, 6]]) {
    assert.throws(() => organizerSpinOutcome(...args), (error) => error instanceof RangeError && error.status === 400);
  }
});

test('new rounds predetermine a pooled winner-take-all outcome for every allowed rake', () => {
  for (const [rakePercent, rakeAmount, prizePool] of [[2, 300, 14700], [3, 450, 14550], [4, 600, 14400], [5, 750, 14250]]) {
    const f = fixture(STAKE * 3, rakePercent), before = f.chips.supply(1);
    const reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE });
    const expected = organizerSpinOutcome(STAKE, rakePercent);
    assert.deepEqual(expected, { payoutModel: 'pooled', multiplier: null, rakePercent, rakeAmount, entryTotal: 15000, prizePool, prizes: [prizePool, 0, 0] });
    assert.equal(reserved.max_reserve, 0);
    assert.deepEqual(JSON.parse(reserved.outcome), expected);
    assert.deepEqual(f.spin.outcomeForTable('spin:1'), expected);
    assert.equal(f.chips.balance(1, 1), STAKE * 3, 'waiting round reserves no chips');
    fundSeats(f);
    const committed = f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: expected });
    assert.equal(committed.applied, true);
    assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: expected.prizes[0] }).applied, true);
    assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 3, sessionId: 'round:seat:3', place: 2, amount: 0 }).applied, true);
    assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 4, sessionId: 'round:seat:4', place: 3, amount: 0 }).complete, true);
    assert.deepEqual(f.spin.payPlace({ tableId: 'spin:1', userId: 4, sessionId: 'round:seat:4', place: 3, amount: 0 }), { applied: false, complete: true });
    assert.deepEqual(f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: prizePool }), { applied: false, complete: true });
    const after = f.chips.supply(1);
    assert.equal(f.chips.balance(1, 2), expected.prizePool);
    assert.equal(f.db.prepare("SELECT COUNT(*) count FROM organizer_chip_journals WHERE reference=? AND kind='spin_payout'").get(`spin:${reserved.id}:place:1`).count, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) count FROM organizer_chip_journals WHERE reference=? AND kind='spin_rake'").get(`spin:${reserved.id}:rake`).count, 1);
    assert.equal(after.minted, before.minted);
    assert.equal(after.burned - before.burned, expected.rakeAmount);
    assert.equal(after.circulating, before.circulating - expected.rakeAmount);
  }
});

test('pooled terms are immutable across commit and replay', () => {
  const f = fixture(), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(f);
  const stored = JSON.parse(reserved.outcome);
  assert.throws(() => f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: { ...stored, rakePercent: 2 } }), (e) => e.code === 'outcome_mismatch');
  f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: stored });
  assert.throws(() => f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: 1 }), (e) => e.code === 'payout_mismatch');
  const amount = stored.prizes[0]; f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount });
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount }).applied, false);
  assert.throws(() => f.spin.payPlace({ tableId: 'spin:1', userId: 3, sessionId: 'round:seat:3', place: 1, amount }), (e) => e.code === 'place_paid');
  assert.throws(() => f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: { ...stored, prizePool: stored.prizePool - 1 } }), (e) => ['outcome_mismatch', 'round_conflict'].includes(e.code));
});

test('10,000-chip tickets pay the 30,000 pool minus the selected rake', () => {
  for (const [rate, rake, prize] of [[2, 600, 29400], [3, 900, 29100], [4, 1200, 28800], [5, 1500, 28500]]) {
    const terms = organizerSpinOutcome(10000, rate);
    assert.equal(terms.entryTotal, 30000);
    assert.equal(terms.rakeAmount, rake);
    assert.deepEqual(terms.prizes, [prize, 0, 0]);
    assert.equal(terms.prizePool + terms.rakeAmount, terms.entryTotal);
  }
});

test('new waiting rounds require no organizer reserve balance', () => {
  const f = fixture(999, null);
  const waiting = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE });
  assert.equal(waiting.max_reserve, 0);
  assert.equal(JSON.parse(waiting.outcome).rakePercent, 5);
  assert.equal(f.chips.supply(1).minted, 999);
});

test('committed pooled abort refunds all entries before any payout', () => {
  const f = fixture(), before = f.chips.supply(1), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(f);
  f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: JSON.parse(reserved.outcome) });
  assert.equal(f.spin.abortRound('spin:1').state, 'aborted');
  assert.deepEqual([2, 3, 4].map((userId) => f.chips.balance(1, userId)), [STAKE, STAKE, STAKE]);
  assert.deepEqual(f.chips.supply(1), before);
});

test('restart preserves a partially paid pooled round as a dispute and completes it once', () => {
  const f = fixture(), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(f);
  const pooled = JSON.parse(reserved.outcome);
  f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: pooled });
  f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: pooled.prizePool });
  const winnerBalance = f.chips.balance(1, 2);
  assert.equal(f.spin.recoverRounds()[0].state, 'disputed');
  assert.throws(() => f.spin.abortRound('spin:1'), (error) => error.code === 'round_disputed');
  assert.equal(f.chips.balance(1, 2), winnerBalance);
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 3, sessionId: 'round:seat:3', place: 2, amount: 0 }).applied, true);
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 4, sessionId: 'round:seat:4', place: 3, amount: 0 }).complete, true);
  assert.equal(f.db.prepare("SELECT COUNT(*) count FROM organizer_chip_journals WHERE reference=? AND kind='spin_rake'").get(`spin:${reserved.id}:rake`).count, 1);
});

test('waiting abort leaves player entries for ordinary session recovery', () => {
  const g = fixture(), waiting = g.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(g);
  assert.equal(g.spin.abortRound('spin:1').id, waiting.id); assert.equal(g.chips.balance(1, 2), 0);
  assert.equal(g.chips.recoverSessions().length, 3); assert.equal(g.chips.balance(1, 2), STAKE);
});

test('legacy waiting and committed rows retain their reserved multiplier plans', () => {
  const f = fixture(STAKE * MAX_MULTIPLIER + STAKE * 3);
  const legacy = outcome(10), roundId = 'legacy-round';
  f.db.exec('BEGIN IMMEDIATE');
  f.chips.moveInTransaction({ organizerId: 1, from: 'wallet:1', to: `event:spin:${roundId}`, amount: STAKE * MAX_MULTIPLIER, kind: 'spin_reserve', reference: `spin:${roundId}:reserve` });
  f.db.exec('COMMIT');
  f.db.prepare("INSERT INTO organizer_chip_spin_rounds(id,organizer_id,table_id,stake,max_reserve,state,created_at) VALUES (?,1,'spin:1',?,?,'waiting',datetime('now'))").run(roundId, STAKE, STAKE * MAX_MULTIPLIER);
  assert.equal(f.spin.outcomeForTable('spin:1'), undefined);
  fundSeats(f);
  const committed = f.spin.commitRound({ roundId, players: players(), outcome: legacy });
  assert.equal(committed.max_reserve, STAKE * MAX_MULTIPLIER);
  assert.deepEqual(JSON.parse(committed.outcome), { multiplier: legacy.multiplier, prizePool: legacy.prizePool, prizes: legacy.prizes });
  [2, 3, 4].forEach((userId, index) => f.spin.payPlace({ tableId: 'spin:1', userId, sessionId: `round:seat:${userId}`, place: index + 1, amount: legacy.prizes[index] }));
  assert.equal(f.spin.currentRound('spin:1'), null);
});
