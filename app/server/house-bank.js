import { createHash } from 'node:crypto';
import { withGameReceipt } from './game-receipts.js';

export function ensureHouseBank(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS house_accounts (
    scope TEXT PRIMARY KEY,
    available INTEGER NOT NULL CHECK(available>=0),
    reserved INTEGER NOT NULL CHECK(reserved>=0),
    funded INTEGER NOT NULL CHECK(funded>=0),
    settled_net INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>=0)
  );
  CREATE TABLE IF NOT EXISTS house_reservations (
    reservation_id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    owner_operation_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>0),
    status TEXT NOT NULL CHECK(status IN ('active','released','consumed')),
    created_at TEXT NOT NULL,
    settled_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_active_house_operation ON house_reservations(scope,owner_operation_id) WHERE status='active';
  CREATE TABLE IF NOT EXISTS house_ledger (
    id INTEGER PRIMARY KEY,
    movement_id TEXT NOT NULL UNIQUE,
    actor_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    reservation_id TEXT NOT NULL DEFAULT '',
    operation_id TEXT NOT NULL,
    movement_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    movement_index INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    available_after INTEGER NOT NULL,
    reserved_after INTEGER NOT NULL,
    funded_after INTEGER NOT NULL,
    settled_net_after INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_house_ledger_operation ON house_ledger(actor_id,scope,operation_id,movement_kind,reservation_id,entity_id,movement_index);`);
}

function transaction(db, callback) {
  if (db.isTransaction) return callback();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function houseAccount(db, scope) {
  const account = db.prepare('SELECT * FROM house_accounts WHERE scope = ?').get(scope);
  if (!account) return null;
  if (account.available + account.reserved !== account.funded + account.settled_net) throw new Error(`House account is not conserved: ${scope}`);
  return account;
}

function accountForUpdate(db, scope) {
  const account = houseAccount(db, scope);
  if (!account) throw new Error(`Unknown house scope: ${scope}`);
  return account;
}

function writeMovement(db, { actorId, scope, operationId, movementKind, reservationId = '', entityId, movementIndex = 0, amount, account }) {
  const movementId = createHash('sha256').update(JSON.stringify([actorId, scope, operationId, movementKind, reservationId, entityId, movementIndex])).digest('hex');
  db.prepare(`INSERT INTO house_ledger
    (movement_id,actor_id,scope,reservation_id,operation_id,movement_kind,entity_id,movement_index,amount,available_after,reserved_after,funded_after,settled_net_after)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(movementId, actorId, scope, reservationId, operationId, movementKind, entityId, movementIndex, amount,
    account.available, account.reserved, account.funded, account.settled_net);
}

function bumpRevision(db, scope) {
  db.exec(`UPDATE house_accounts SET revision = revision + 1 WHERE scope = '${scope.replaceAll("'", "''")}'`);
}

export function fundHouse(db, { scope, actorId, operationId, amount, entityId = 'owner' }) {
  ensureHouseBank(db);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Funding must be a positive whole amount');
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `house:${scope}:fund`, request: { scope, amount, entityId } }, () => {
    db.prepare(`INSERT INTO house_accounts (scope,available,reserved,funded,settled_net,revision) VALUES (?,?,0,?,0,0)
      ON CONFLICT(scope) DO UPDATE SET available = available + ?, funded = funded + ?`).run(scope, amount, amount, amount, amount);
    bumpRevision(db, scope);
    const account = accountForUpdate(db, scope);
    writeMovement(db, { actorId, scope, operationId, movementKind: 'fund', entityId, amount, account });
    return { revision: account.revision, state: account };
  }));
}

export function creditHouse(db, { scope, actorId, operationId, amount, entityId, movementIndex = 0 }) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Receipt must be a nonnegative whole amount');
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `house:${scope}:receipt`, request: { scope, amount, entityId, movementIndex } }, () => {
    db.prepare('UPDATE house_accounts SET available = available + ?, settled_net = settled_net + ? WHERE scope = ?').run(amount, amount, scope);
    bumpRevision(db, scope);
    const account = accountForUpdate(db, scope);
    writeMovement(db, { actorId, scope, operationId, movementKind: 'entry_receipt', entityId, movementIndex, amount, account });
    return { revision: account.revision, state: account };
  }));
}

export function debitHouse(db, { scope, actorId, operationId, amount, entityId, movementIndex = 0, movementKind = 'entry_reversal' }) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Reversal must be a nonnegative whole amount');
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `house:${scope}:debit`, request: { scope, amount, entityId, movementIndex, movementKind } }, () => {
    if (accountForUpdate(db, scope).available < amount) throw Object.assign(new Error('Insufficient house funds for receipt reversal'), { status: 409 });
    db.prepare('UPDATE house_accounts SET available = available - ?, settled_net = settled_net - ? WHERE scope = ?').run(amount, amount, scope);
    bumpRevision(db, scope);
    const account = accountForUpdate(db, scope);
    writeMovement(db, { actorId, scope, operationId, movementKind, entityId, movementIndex, amount, account });
    return { revision: account.revision, state: account };
  }));
}

export function reserveHouse(db, { scope, actorId, operationId, reservationId, amount, entityId = reservationId }) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Reservation must be a positive whole amount');
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `house:${scope}:reserve`, request: { scope, reservationId, amount, entityId } }, () => {
    if (accountForUpdate(db, scope).available < amount) throw Object.assign(new Error('Insufficient house funds'), { status: 409 });
    db.prepare('INSERT INTO house_reservations (reservation_id,scope,owner_operation_id,amount,status,created_at) VALUES (?,?,?,?,?,datetime(\'now\'))')
      .run(reservationId, scope, operationId, amount, 'active');
    db.prepare('UPDATE house_accounts SET available = available - ?, reserved = reserved + ? WHERE scope = ?').run(amount, amount, scope);
    bumpRevision(db, scope);
    const account = accountForUpdate(db, scope);
    writeMovement(db, { actorId, scope, operationId, movementKind: 'reserve', reservationId, entityId, amount, account });
    return { revision: account.revision, state: account };
  }));
}

export function releaseHouse(db, { scope, actorId, operationId, reservationId }) {
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `house:${scope}:release`, request: { scope, reservationId } }, () => {
    const reservation = db.prepare("SELECT * FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(reservationId);
    if (!reservation || reservation.scope !== scope) throw new Error('Reservation is not active');
    db.prepare("UPDATE house_reservations SET status = 'released', settled_at = datetime('now') WHERE reservation_id = ?").run(reservationId);
    db.prepare('UPDATE house_accounts SET available = available + ?, reserved = reserved - ? WHERE scope = ?').run(reservation.amount, reservation.amount, scope);
    bumpRevision(db, scope);
    const account = accountForUpdate(db, scope);
    writeMovement(db, { actorId, scope, operationId, movementKind: 'release', reservationId, entityId: reservationId, amount: reservation.amount, account });
    return { revision: account.revision, state: account };
  }));
}

export function consumeHouseReservation(db, { scope, actorId, operationId, reservationId, amount }) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Payout must be a nonnegative whole amount');
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `house:${scope}:consume`, request: { scope, reservationId, amount } }, () => {
    const reservation = db.prepare("SELECT * FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(reservationId);
    if (!reservation || reservation.scope !== scope || amount > reservation.amount) throw Object.assign(Error('Payout exceeds the active reservation'), { status: 409 });
    const remaining = reservation.amount - amount;
    if (remaining) {
      db.prepare('UPDATE house_reservations SET amount = ? WHERE reservation_id = ?').run(remaining, reservationId);
    } else {
      db.prepare("UPDATE house_reservations SET status = 'consumed', settled_at = datetime('now') WHERE reservation_id = ?").run(reservationId);
    }
    db.prepare('UPDATE house_accounts SET reserved = reserved - ?, settled_net = settled_net - ? WHERE scope = ?')
      .run(amount, amount, scope);
    bumpRevision(db, scope);
    const account = accountForUpdate(db, scope);
    writeMovement(db, { actorId, scope, operationId, movementKind: 'consume', reservationId, entityId: reservationId, amount, account });
    return { revision: account.revision, state: account };
  }));
}

export function requireHouseResult(result) {
  if (result.status !== 200) throw Object.assign(new Error(result.body.message), { status: result.status });
  return result;
}
