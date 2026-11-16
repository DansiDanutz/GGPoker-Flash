import { addTransactionEx } from './db.js';
import { withGameReceipt } from './game-receipts.js';
import { ensureTournamentFormatStore } from './tournament-formats.js';
import { roomHasHandInProgress } from './tournament-state.js';
import { MAX_TOURNAMENT_LEVEL, tournamentLevelBlinds } from './tournament-blinds.js';

export function tournamentBlinds(tournament = {}, level = 1) {
  const { sb, bb } = tournamentLevelBlinds(tournament, level);
  return { sb, bb };
}

export function advanceRoomLevel(room, { delta = 1, liveTables, now = Date.now() } = {}) {
  if (!room) return { ok: false, reason: 'room not running' };
  if (room.winner) return { ok: false, reason: 'finished' };
  if (roomHasHandInProgress(room, liveTables)) return { ok: false, reason: 'hand in progress' };
  const step = Math.max(1, Math.min(20, Number(delta) || 1));
  const current = Math.max(1, Number(room.tournament?.level) || 1);
  const level = Math.min(MAX_TOURNAMENT_LEVEL, current + step);
  room.tournament.level = level;
  room.tournament.levelStartedAt = now;
  for (const flight of room.flights || []) {
    liveTables?.get(flight.id)?.table?.applyTournamentLevel?.();
    room.ops?.broadcast?.(flight.id);
  }
  return { ok: true, level, blinds: tournamentBlinds(room.tournament, level) };
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

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function tournament(db, id) {
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  if (!row) fail('Tournament not found', 404);
  return row;
}
function revision(db, id) {
  const next = tournament(db, id).revision + 1;
  db.prepare('UPDATE tournaments SET revision = ? WHERE id = ?').run(next, id);
  return next;
}

export function applyTournamentControls(db, { room, now = Date.now(), actor = 'system' }) {
  ensureTournamentFormatStore(db);
  const id = room?.id;
  if (!id) return { paused: false, cancelled: false };
  const current = tournament(db, id);
  if (current.pause_requested || current.cancel_requested) {
    for (const flight of room.flights || []) {
      const table = room.ops.table(flight.id);
      if (table.nextHandAt) {
        table.paused = true;
        table.tick(now);
      }
    }
  }
  if (room.anyHandInProgress?.() || room.anyHandPending?.()) return { paused: false, cancelled: false };
  if (current.cancel_requested && ['registering', 'running'].includes(current.status)) {
    const entries = db.prepare("SELECT account_id FROM tournament_entries WHERE tournament_id = ? AND status IN ('registered','active') GROUP BY account_id").all(id);
    for (const entry of entries) {
      const payment = addTransactionEx(entry.account_id, 'tourney_refund', current.buyin + current.fee, `Tournament cancellation ${current.name}`, 'USD', { reference: `tournament:cancel:${id}:${entry.account_id}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
      if (!payment.applied && !db.prepare('SELECT 1 FROM transactions WHERE user_id = ? AND reference = ?').get(entry.account_id, `tournament:cancel:${id}:${entry.account_id}`)) fail('Tournament refund failed');
    }
    db.prepare("UPDATE tournament_entries SET status = 'completed' WHERE tournament_id = ? AND status IN ('registered','active')").run(id);
    db.prepare("UPDATE tournament_participation SET status = 'completed' WHERE tournament_id = ? AND status IN ('registered','active')").run(id);
    const next = revision(db, id);
    db.prepare("UPDATE tournaments SET status = 'cancelled',cancel_requested = 0 WHERE id = ?").run(id);
    for (const flight of room.flights || []) room.ops.table(flight.id).paused = true;
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actor, 'tournament_cancel', `${id} ${entries.length} active entries refunded`);
    return { paused: false, cancelled: true };
  }
  if (current.pause_requested && current.status === 'running') {
    for (const flight of room.flights || []) room.ops.table(flight.id).paused = true;
    const next = revision(db, id);
    db.prepare("UPDATE tournaments SET status = 'paused',paused_at = ?,pause_after_level = ?,pause_requested = 0 WHERE id = ?").run(now, room.tournament.level || 1, id);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actor, 'tournament_pause', id);
    return { paused: true, cancelled: false };
  }
  return { paused: false, cancelled: false };
}

function command(db, { actorId, tournamentId, action, expectedRevision, operationId, reason }, execute) {
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:${action}`, request: { expectedRevision, reason } }, () => transaction(db, () => {
    const current = tournament(db, tournamentId);
    if (current.revision !== expectedRevision) fail('Tournament revision changed', 409);
    return execute(current);
  }));
}

export function pauseTournament(db, input) {
  return command(db, input, (current) => {
    if (current.status !== 'running') fail('Tournament cannot be paused', 409);
    db.prepare('UPDATE tournaments SET pause_requested = 1 WHERE id = ?').run(input.tournamentId);
    const next = revision(db, input.tournamentId);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(input.actorLogin || input.actorId, 'tournament_pause_requested', input.reason || '');
    return { revision: next, state: { tournamentId: input.tournamentId, status: 'pause-requested', revision: next } };
  });
}

export function resumeTournament(db, input) {
  return command(db, input, (current) => {
    if (current.status !== 'paused' || !current.paused_at) fail('Tournament is not paused', 409);
    const room = input.room;
    const elapsed = Math.max(0, Date.now() - current.paused_at);
    for (const flight of room?.flights || []) {
      const table = room.ops.table(flight.id);
      table.paused = false;
      if (table.tournament?.levelStartedAt) table.tournament.levelStartedAt += elapsed;
      if (table.levelStartedAt) table.levelStartedAt += elapsed;
      if (table.actionEndsAt) table.actionEndsAt += elapsed;
      if (table.nextHandAt) table.nextHandAt += elapsed;
      table.maybeStart();
    }
    const next = revision(db, input.tournamentId);
    db.prepare("UPDATE tournaments SET status = 'running',paused_at = NULL,pause_after_level = NULL WHERE id = ?").run(input.tournamentId);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(input.actorLogin || input.actorId, 'tournament_resume', input.reason || '');
    return { revision: next, state: { tournamentId: input.tournamentId, status: 'running', revision: next } };
  });
}

export function cancelTournament(db, input) {
  return command(db, input, (current) => {
    if (!['registering', 'running'].includes(current.status)) fail('Tournament cannot be cancelled', 409);
    db.prepare('UPDATE tournaments SET cancel_requested = 1 WHERE id = ?').run(input.tournamentId);
    const next = revision(db, input.tournamentId);
    return { revision: next, state: { tournamentId: input.tournamentId, status: 'cancel-requested', revision: next } };
  });
}

export function addonTournament(db, { actorId, tournamentId, expectedRevision, operationId, room }) {
  ensureTournamentFormatStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:addon`, request: { expectedRevision } }, () => transaction(db, () => {
    const current = tournament(db, tournamentId);
    if (current.revision !== expectedRevision) fail('Tournament revision changed', 409);
    if (!current.addon_enabled || current.status !== 'paused' || current.pause_after_level !== current.break_after_level) fail('Add-on window is closed', 409);
    const participation = db.prepare("SELECT * FROM tournament_participation WHERE tournament_id = ? AND account_id = ? AND status = 'active'").get(tournamentId, actorId);
    if (!participation || participation.addon_claimed) fail('Add-on is unavailable', 409);
    const table = room.tableOf(actorId);
    if (!table?.seatOf(actorId)?.player) fail('Add-on seat not found', 409);
    const charge = addTransactionEx(actorId, 'tourney_addon', -current.addon_price, `Tournament add-on ${current.name}`, 'USD', { reference: `tournament:addon:${tournamentId}:${actorId}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
    if (!charge.applied) fail('Add-on was already recorded', 409);
    table.seatOf(actorId).player.stack += current.addon_chips;
    db.prepare('UPDATE tournament_participation SET addon_claimed = 1 WHERE tournament_id = ? AND account_id = ?').run(tournamentId, actorId);
    const next = revision(db, tournamentId);
    return { revision: next, state: { tournamentId, addonClaimed: true, addedChips: current.addon_chips, stack: table.seatOf(actorId).player.stack, revision: next } };
  }));
}
