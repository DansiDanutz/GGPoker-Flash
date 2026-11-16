// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerChipSpin, MAX_MULTIPLIER } from './organizer-chip-spin.js';
import { spinPayouts } from './spin.js';

const STAKE = 5000;
function fixture(seed = STAKE * MAX_MULTIPLIER + STAKE * 3) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES (1,0,NULL),(2,0,NULL),(3,0,NULL),(4,0,NULL);
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2099-01-01T00:00:00.000Z');
    CREATE TABLE tables(id TEXT PRIMARY KEY,game TEXT,owner_id INTEGER,private INTEGER,chip_economy INTEGER,min_buyin INTEGER,max_buyin INTEGER);
    INSERT INTO tables VALUES ('spin:1','spingold',1,1,1,5000,5000);
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

test('reserves maximum liability before join and commits the verified maximum outcome without redraw', () => {
  const f = fixture(), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE });
  assert.equal(reserved.max_reserve, STAKE * MAX_MULTIPLIER);
  assert.equal(f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }).id, reserved.id);
  fundSeats(f); assert.equal(f.chips.balance(1, 1), 0);
  const committed = f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: outcome(20000) });
  assert.equal(committed.applied, true); assert.equal(JSON.parse(committed.outcome).multiplier, 20000);
  const prizes = outcome(20000).prizes;
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: prizes[0] }).applied, true);
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 3, sessionId: 'round:seat:3', place: 2, amount: prizes[1] }).applied, true);
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 4, sessionId: 'round:seat:4', place: 3, amount: prizes[2] }).complete, true);
  assert.deepEqual(f.spin.payPlace({ tableId: 'spin:1', userId: 4, sessionId: 'round:seat:4', place: 3, amount: prizes[2] }), { applied: false, complete: true });
  assert.equal(f.spin.currentRound('spin:1'), null); assert.equal(f.chips.balance(1, 1), STAKE * 3);
});

test('strict payouts reject wrong amounts, duplicate places, and changed replay details', () => {
  const f = fixture(), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(f);
  f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: outcome(10) });
  assert.throws(() => f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: 1 }), (e) => e.code === 'payout_mismatch');
  const amount = outcome(10).prizes[0]; f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount });
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount }).applied, false);
  assert.throws(() => f.spin.payPlace({ tableId: 'spin:1', userId: 3, sessionId: 'round:seat:3', place: 1, amount }), (e) => e.code === 'place_paid');
  assert.throws(() => f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: outcome(5) }), (e) => e.code === 'round_conflict');
});

test('low multiplier burns entry excess and never mints chips', () => {
  const f = fixture(), before = f.chips.supply(1), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(f);
  const low = outcome(2); f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: low });
  [2, 3, 4].forEach((userId, index) => f.spin.payPlace({ tableId: 'spin:1', userId, sessionId: `round:seat:${userId}`, place: index + 1, amount: low.prizes[index] }));
  const after = f.chips.supply(1);
  assert.equal(after.minted, before.minted); assert.equal(after.burned - before.burned, STAKE); assert.equal(after.circulating, before.circulating - STAKE);
});

test('insufficient organizer balance refuses reservation without a round or mint', () => {
  const f = fixture(999);
  assert.throws(() => f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }), (e) => e.code === 'insufficient_chips');
  assert.equal(f.spin.currentRound('spin:1'), null); assert.equal(f.chips.supply(1).minted, 999);
});

test('restart preserves a partially paid outcome as a durable dispute without extra refunds', () => {
  const f = fixture(), reserved = f.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(f);
  const high = outcome(100); f.spin.commitRound({ roundId: reserved.id, players: players(), outcome: high });
  f.spin.payPlace({ tableId: 'spin:1', userId: 2, sessionId: 'round:seat:2', place: 1, amount: high.prizes[0] });
  const balances = [2, 3, 4].map((userId) => f.chips.balance(1, userId)), pool = f.db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=1 AND account_key=?').get(`event:spin:${reserved.id}`).balance;
  f.db.prepare('UPDATE users SET banned=1 WHERE id=1').run();
  const recovered = f.spin.recoverRounds();
  assert.equal(recovered.length, 1); assert.equal(recovered[0].state, 'disputed');
  assert.deepEqual([2, 3, 4].map((userId) => f.chips.balance(1, userId)), balances);
  assert.equal(f.db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=1 AND account_key=?').get(`event:spin:${reserved.id}`).balance, pool);
  assert.throws(() => f.spin.abortRound('spin:1'), (e) => e.code === 'round_disputed');
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 3, sessionId: 'round:seat:3', place: 2, amount: high.prizes[1] }).applied, true);
  assert.equal(f.spin.payPlace({ tableId: 'spin:1', userId: 4, sessionId: 'round:seat:4', place: 3, amount: high.prizes[2] }).complete, true);
});

test('waiting abort leaves player entries for ordinary session recovery', () => {
  const g = fixture(), waiting = g.spin.reserveRound({ organizerId: 1, tableId: 'spin:1', stake: STAKE }); fundSeats(g);
  assert.equal(g.spin.abortRound('spin:1').id, waiting.id); assert.equal(g.chips.balance(1, 2), 0);
  assert.equal(g.chips.recoverSessions().length, 3); assert.equal(g.chips.balance(1, 2), STAKE);
});
