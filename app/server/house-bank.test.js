import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureHouseBank, fundHouse, creditHouse, reserveHouse, releaseHouse, consumeHouseReservation, houseAccount, requireHouseResult } from './house-bank.js';

function db() {
  const database = new DatabaseSync(':memory:');
  ensureHouseBank(database);
  return database;
}

test('owner funding, receipt, reservation, payout and release conserve each scope', () => {
  const database = db();
  fundHouse(database, { scope: 'spin3:100', actorId: 1, operationId: 'fund-1', amount: 100 });
  creditHouse(database, { scope: 'spin3:100', actorId: 2, operationId: 'entry-1', amount: 30, entityId: 'player-2' });
  reserveHouse(database, { scope: 'spin3:100', actorId: 2, operationId: 'entry-1', reservationId: 'r1', amount: 20 });
  assert.deepEqual({ ...houseAccount(database, 'spin3:100') }, { scope: 'spin3:100', available: 110, reserved: 20, funded: 100, settled_net: 30, revision: 3 });
  consumeHouseReservation(database, { scope: 'spin3:100', actorId: 2, operationId: 'draw-1', reservationId: 'r1', amount: 20 });
  assert.deepEqual({ ...houseAccount(database, 'spin3:100') }, { scope: 'spin3:100', available: 110, reserved: 0, funded: 100, settled_net: 10, revision: 4 });
});

test('releasing a hold restores available funds without changing house net', () => {
  const database = db();
  fundHouse(database, { scope: 'cash-insurance', actorId: 1, operationId: 'fund-1', amount: 100 });
  creditHouse(database, { scope: 'cash-insurance', actorId: 2, operationId: 'entry-1', amount: 30, entityId: 'player-2' });
  reserveHouse(database, { scope: 'cash-insurance', actorId: 2, operationId: 'entry-1', reservationId: 'r1', amount: 20 });
  releaseHouse(database, { scope: 'cash-insurance', actorId: 2, operationId: 'cancel-1', reservationId: 'r1' });
  assert.deepEqual({ ...houseAccount(database, 'cash-insurance') }, { scope: 'cash-insurance', available: 130, reserved: 0, funded: 100, settled_net: 30, revision: 4 });
});

test('multi-recipient movements in one operation have unique identities and one atomic balance', () => {
  const database = db();
  fundHouse(database, { scope: 'bad-beat-jackpot', actorId: 1, operationId: 'fund-1', amount: 100 });
  reserveHouse(database, { scope: 'bad-beat-jackpot', actorId: 2, operationId: 'hand-1', reservationId: 'r1', amount: 60 });
  for (const [index, entityId] of ['a', 'b', 'c'].entries()) {
    const result = creditHouse(database, { scope: 'bad-beat-jackpot', actorId: 2, operationId: `hand-1:${entityId}`, amount: 0, entityId, movementIndex: index });
    assert.equal(result.status, 200);
  }
  const ids = database.prepare('SELECT movement_id FROM house_ledger').all().map((row) => row.movement_id);
  assert.equal(new Set(ids).size, ids.length);
  const rejected = consumeHouseReservation(database, { scope: 'bad-beat-jackpot', actorId: 2, operationId: 'hand-1', reservationId: 'r1', amount: 70 });
  assert.equal(rejected.status, 409);
  assert.equal(houseAccount(database, 'bad-beat-jackpot').reserved, 60);
});

test('partial prize consumption retains only the remaining exposure', () => {
  const database = db();
  fundHouse(database, { scope: 'spin3:10000', actorId: 1, operationId: 'fund-1', amount: 100 });
  reserveHouse(database, { scope: 'spin3:10000', actorId: 0, operationId: 'event-1', reservationId: 'event-1', amount: 70 });
  requireHouseResult(consumeHouseReservation(database, { scope: 'spin3:10000', actorId: 2, operationId: 'place-2', reservationId: 'event-1', amount: 10 }));
  assert.equal(houseAccount(database, 'spin3:10000').reserved, 60);
  requireHouseResult(consumeHouseReservation(database, { scope: 'spin3:10000', actorId: 1, operationId: 'place-1', reservationId: 'event-1', amount: 60 }));
  assert.equal(houseAccount(database, 'spin3:10000').reserved, 0);
  assert.equal(database.prepare("SELECT status FROM house_reservations WHERE reservation_id = 'event-1'").get().status, 'consumed');
});

test('an underfunded reservation is rejected without changing the account', () => {
  const database = db();
  fundHouse(database, { scope: 'spin3:5000', actorId: 1, operationId: 'fund-1', amount: 10 });
  const rejected = reserveHouse(database, { scope: 'spin3:5000', actorId: 2, operationId: 'entry-1', reservationId: 'r1', amount: 20 });
  assert.equal(rejected.status, 409);
  assert.throws(() => requireHouseResult(rejected), /Insufficient house funds/);
  assert.equal(houseAccount(database, 'spin3:5000').available, 10);
  assert.equal(houseAccount(database, 'spin3:5000').reserved, 0);
});
