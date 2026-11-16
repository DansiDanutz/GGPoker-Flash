import { randomUUID } from 'node:crypto';
import { withGameReceipt } from './game-receipts.js';

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

function revision(db, scope) {
  return db.prepare('SELECT revision FROM aggregate_revisions WHERE scope = ?').get(scope)?.revision || 0;
}

function bump(db, scope) {
  db.prepare('INSERT INTO aggregate_revisions (scope,revision) VALUES (?,1) ON CONFLICT(scope) DO UPDATE SET revision = revision + 1').run(scope);
  return revision(db, scope);
}

function scope(roomId, accountId) { return `push-seat:${roomId}:${accountId}`; }
function fail(message, status = 409) { throw Object.assign(new Error(message), { status }); }
function operation(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) fail('A valid operationId is required', 400);
  return value;
}
function expected(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('A valid expectedRevision is required', 400);
  return value;
}
function reservation(row) {
  return row ? { reservationId: row.reservation_id, roomId: row.room_id, accountId: row.account_id, destinationSeat: row.destination_seat, status: row.status, revision: row.revision } : null;
}

export function ensurePushSeatStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS aggregate_revisions (
    scope TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0)
  );
  CREATE TABLE IF NOT EXISTS push_seat_grants (
    room_id TEXT NOT NULL, account_id INTEGER NOT NULL, uses INTEGER NOT NULL CHECK(uses BETWEEN 0 AND 3),
    revision INTEGER NOT NULL CHECK(revision>0), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(room_id,account_id)
  );
  CREATE TABLE IF NOT EXISTS push_seat_reservations (
    reservation_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, account_id INTEGER NOT NULL,
    destination_seat INTEGER NOT NULL, destination_account_id INTEGER, status TEXT NOT NULL CHECK(status IN ('reserved','completed','cancelled','expired')),
    revision INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_push_seat_active_account ON push_seat_reservations(room_id,account_id) WHERE status='reserved';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_push_seat_active_destination ON push_seat_reservations(room_id,destination_seat) WHERE status='reserved';`);
}

export function pushSeatState(db, roomId, accountId) {
  ensurePushSeatStore(db);
  const grant = db.prepare('SELECT * FROM push_seat_grants WHERE room_id = ? AND account_id = ?').get(roomId, accountId);
  const active = db.prepare("SELECT * FROM push_seat_reservations WHERE room_id = ? AND account_id = ? AND status = 'reserved'").get(roomId, accountId);
  return { roomId, accountId, remaining: grant?.uses || 0, grantRevision: grant?.revision || 0, revision: revision(db, scope(roomId, accountId)), reservation: reservation(active) };
}

export function grantPushSeat(db, { actorId, roomId, accountId, uses, expectedRevision, operationId }) {
  ensurePushSeatStore(db);
  expected(expectedRevision);
  operation(operationId);
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !Number.isSafeInteger(uses) || uses < 1 || uses > 3) fail('Push Seat uses must be an integer from 1 to 3', 400);
  return withGameReceipt(db, { actorId, operationId, scope: `push-seat-grant:${roomId}:${accountId}`, request: { roomId, accountId, uses, expectedRevision } }, () => transaction(db, () => {
    const current = db.prepare('SELECT revision FROM push_seat_grants WHERE room_id = ? AND account_id = ?').get(roomId, accountId);
    if ((current?.revision || 0) !== expectedRevision) fail('Push Seat grant revision changed');
    const nextRevision = expectedRevision + 1;
    db.prepare(`INSERT INTO push_seat_grants (room_id,account_id,uses,revision) VALUES (?,?,?,?)
      ON CONFLICT(room_id,account_id) DO UPDATE SET uses=excluded.uses,revision=excluded.revision,updated_at=datetime('now')`).run(roomId, accountId, uses, nextRevision);
    const next = bump(db, scope(roomId, accountId));
    return { revision: next, state: pushSeatState(db, roomId, accountId) };
  }));
}

export function reservePushSeat(db, table, { actorId, destinationSeat, expectedRevision, operationId }) {
  ensurePushSeatStore(db);
  expected(expectedRevision);
  operation(operationId);
  if (!Number.isSafeInteger(destinationSeat)) fail('A physical destination seat is required', 400);
  const roomId = table.cfg.id;
  return withGameReceipt(db, { actorId, operationId, scope: scope(roomId, actorId), request: { destinationSeat, expectedRevision } }, () => transaction(db, () => {
    if (revision(db, scope(roomId, actorId)) !== expectedRevision) fail('Push Seat revision changed');
    if (table.tournament || table.spin) fail('Push Seat is unavailable in assigned-seat games');
    const origin = table.seatOf(actorId);
    if (!origin?.player || origin.player.isBot) fail('Take a seat before using Push Seat', 403);
    if (!table.seats[destinationSeat] || destinationSeat === origin.index) fail('Choose another physical seat');
    if (table.holds.has(destinationSeat) || (table.reservations.get(destinationSeat)?.until || 0) > Date.now()) fail('That seat is already reserved');
    const grant = db.prepare('SELECT uses FROM push_seat_grants WHERE room_id = ? AND account_id = ?').get(roomId, actorId);
    if (!grant?.uses) fail('No Push Seat uses remain');
    const reservationId = randomUUID();
    try {
      db.prepare("INSERT INTO push_seat_reservations (reservation_id,room_id,account_id,destination_seat,destination_account_id,status,revision) VALUES (?,?,?,?,?,'reserved',1)")
        .run(reservationId, roomId, actorId, destinationSeat, table.seats[destinationSeat].player?.id ?? null);
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) fail('That seat or your Push Seat request is already reserved');
      throw error;
    }
    const next = bump(db, scope(roomId, actorId));
    return { revision: next, state: pushSeatState(db, roomId, actorId) };
  }));
}

export function cancelPushSeat(db, table, { actorId, expectedRevision, operationId }) {
  ensurePushSeatStore(db);
  expected(expectedRevision);
  operation(operationId);
  const roomId = table.cfg.id;
  return withGameReceipt(db, { actorId, operationId, scope: scope(roomId, actorId), request: { expectedRevision } }, () => transaction(db, () => {
    if (revision(db, scope(roomId, actorId)) !== expectedRevision) fail('Push Seat revision changed');
    const current = db.prepare("SELECT * FROM push_seat_reservations WHERE room_id = ? AND account_id = ? AND status = 'reserved'").get(roomId, actorId);
    if (!current) fail('No active Push Seat reservation');
    db.prepare("UPDATE push_seat_reservations SET status='cancelled',revision=revision+1,completed_at=datetime('now') WHERE reservation_id=? AND status='reserved'").run(current.reservation_id);
    const next = bump(db, scope(roomId, actorId));
    return { revision: next, state: pushSeatState(db, roomId, actorId) };
  }));
}

export function applyPushSeatReservations(db, table) {
  ensurePushSeatStore(db);
  if (table.handInProgress()) return [];
  const pending = db.prepare("SELECT * FROM push_seat_reservations WHERE room_id = ? AND status = 'reserved' ORDER BY created_at,reservation_id").all(table.cfg.id);
  const results = [];
  for (const row of pending) {
    const operationId = `server:push-seat:${row.reservation_id}:boundary`;
    const players = table.seats.map((seat) => seat.player);
    const restore = () => table.seats.forEach((seat, index) => {
      seat.player = players[index];
      if (seat.player) seat.player.seat = index;
    });
    const result = withGameReceipt(db, { actorId: 0, operationId, scope: `push-seat-boundary:${row.reservation_id}`, request: { roomId: row.room_id, handNo: table.handNo } }, () => {
      try {
        const origin = table.seatOf(row.account_id);
        const destination = table.seats[row.destination_seat];
        const invalid = !origin?.player || !destination || (destination.player?.id ?? null) !== row.destination_account_id || table.holds.has(row.destination_seat) || (table.reservations.get(row.destination_seat)?.until || 0) > Date.now();
        if (invalid) {
          db.prepare("UPDATE push_seat_reservations SET status='expired',revision=revision+1,completed_at=datetime('now') WHERE reservation_id=? AND status='reserved'").run(row.reservation_id);
          bump(db, scope(row.room_id, row.account_id));
          return { revision: row.revision + 1, state: { reservationId: row.reservation_id, status: 'expired' } };
        }
        const occupant = destination.player;
        origin.player.seat = row.destination_seat;
        destination.player = origin.player;
        origin.player = occupant || null;
        if (occupant) occupant.seat = origin.index;
        const spent = db.prepare('UPDATE push_seat_grants SET uses=uses-1,revision=revision+1,updated_at=datetime(\'now\') WHERE room_id=? AND account_id=? AND uses>0').run(row.room_id, row.account_id);
        if (spent.changes !== 1) fail('Push Seat use is no longer available');
        db.prepare("UPDATE push_seat_reservations SET status='completed',revision=revision+1,completed_at=datetime('now') WHERE reservation_id=? AND status='reserved'").run(row.reservation_id);
        const next = bump(db, scope(row.room_id, row.account_id));
        return { revision: next, state: { reservationId: row.reservation_id, status: 'completed', accountId: row.account_id, destinationSeat: row.destination_seat, displacedAccountId: occupant?.id ?? null, originSeat: origin.index } };
      } catch (error) {
        restore();
        throw error;
      }
    });
    if (result.status !== 200) restore();
    if (result.status === 200 && !result.replayed) {
      table.emit({ type: 'push_seat_changed', ...result.body.state });
      results.push(result.body.state);
    } else if (result.status !== 200) {
      results.push({ reservationId: row.reservation_id, status: 'error', message: result.body.message });
    }
  }
  return results;
}
