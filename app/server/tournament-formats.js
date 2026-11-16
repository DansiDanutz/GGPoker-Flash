import { addTransactionEx } from './db.js';
import { withGameReceipt } from './game-receipts.js';

const FIELDS = ['rebuy_enabled', 'rebuy_price', 'rebuy_chips', 'reentry_enabled', 'reentry_price', 'addon_enabled', 'addon_price', 'addon_chips', 'break_after_level'];

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

export function ensureTournamentFormatStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tournament_entries (
    entry_id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    entry_kind TEXT NOT NULL CHECK(entry_kind IN ('initial','rebuy','reentry')),
    entry_order INTEGER NOT NULL,
    seat_identity TEXT,
    status TEXT NOT NULL CHECK(status IN ('registered','active','eliminated','completed','disqualified')),
    operation_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tournament_participation (
    tournament_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    rebuy_count INTEGER NOT NULL DEFAULT 0,
    reentry_count INTEGER NOT NULL DEFAULT 0,
    addon_claimed INTEGER NOT NULL DEFAULT 0,
    disqualified_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('registered','active','eliminated','completed','disqualified')),
    PRIMARY KEY(tournament_id,account_id)
  );`);
  const entryTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tournament_entries'").get();
  if (entryTable && !entryTable.sql.includes("'rebuy'")) {
    transaction(db, () => {
      db.exec('ALTER TABLE tournament_entries RENAME TO tournament_entries_v1');
      db.exec(`CREATE TABLE tournament_entries (
        entry_id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        entry_kind TEXT NOT NULL CHECK(entry_kind IN ('initial','rebuy','reentry')),
        entry_order INTEGER NOT NULL,
        seat_identity TEXT,
        status TEXT NOT NULL CHECK(status IN ('registered','active','eliminated','completed','disqualified')),
        operation_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )`);
      db.exec('INSERT INTO tournament_entries SELECT * FROM tournament_entries_v1');
      db.exec('DROP TABLE tournament_entries_v1');
    });
  }
  for (const field of FIELDS) {
    const type = field === 'break_after_level' ? 'INTEGER' : 'INTEGER NOT NULL DEFAULT 0';
    try { db.exec(`ALTER TABLE tournaments ADD COLUMN ${field} ${type}`); } catch { /* already exists */ }
  }
  try { db.exec('ALTER TABLE tournaments ADD COLUMN revision INTEGER NOT NULL DEFAULT 1'); } catch { /* already exists */ }
  for (const [field, type] of [['pause_requested', 'INTEGER NOT NULL DEFAULT 0'], ['cancel_requested', 'INTEGER NOT NULL DEFAULT 0'], ['paused_at', 'INTEGER'], ['pause_after_level', 'INTEGER']]) {
    try { db.exec(`ALTER TABLE tournaments ADD COLUMN ${field} ${type}`); } catch { /* already exists */ }
  }
  const registrations = db.prepare('SELECT tournament_id,user_id,created_at FROM tourney_regs ORDER BY tournament_id,user_id').all();
  for (const registration of registrations) {
    const running = db.prepare("SELECT status FROM tournaments WHERE id = ?").get(registration.tournament_id)?.status === 'running';
    const entryId = `legacy:${registration.tournament_id}:${registration.user_id}`;
    db.prepare(`INSERT OR IGNORE INTO tournament_entries (entry_id,tournament_id,account_id,entry_kind,entry_order,seat_identity,status,operation_id,created_at)
      VALUES (?,?, 'initial',0,NULL,?,?,?,?)`).run(entryId, registration.tournament_id, registration.user_id, running ? 'active' : 'registered', `legacy-migration:${registration.tournament_id}:${registration.user_id}`, registration.created_at);
    db.prepare('INSERT OR IGNORE INTO tournament_participation (tournament_id,account_id,status) VALUES (?,?,?)').run(registration.tournament_id, registration.user_id, running ? 'active' : 'registered');
  }
}

export function recordInitialTournamentEntry(db, tournamentId, accountId) {
  ensureTournamentFormatStore(db);
  const entryId = `initial:${tournamentId}:${accountId}:0`;
  db.prepare(`INSERT OR IGNORE INTO tournament_entries (entry_id,tournament_id,account_id,entry_kind,entry_order,seat_identity,status,operation_id,created_at)
    VALUES (?,?,?,'initial',0,?,'registered',?,datetime('now'))`).run(entryId, tournamentId, accountId, entryId, `entry:${entryId}`);
  db.prepare("INSERT OR IGNORE INTO tournament_participation (tournament_id,account_id,status) VALUES (?,?,'registered')").run(tournamentId, accountId);
}

export function activateTournamentEntries(db, tournamentId) {
  ensureTournamentFormatStore(db);
  db.prepare("UPDATE tournament_entries SET status = 'active',seat_identity = entry_id WHERE tournament_id = ? AND status IN ('registered','active')").run(tournamentId);
  db.prepare("UPDATE tournament_participation SET status = 'active' WHERE tournament_id = ? AND status = 'registered'").run(tournamentId);
}

export function eliminateTournamentEntrant(db, tournamentId, accountId) {
  ensureTournamentFormatStore(db);
  db.prepare("UPDATE tournament_entries SET status = 'eliminated' WHERE tournament_id = ? AND account_id = ? AND status = 'active'").run(tournamentId, accountId);
  db.prepare("UPDATE tournament_participation SET status = 'eliminated' WHERE tournament_id = ? AND account_id = ? AND status = 'active'").run(tournamentId, accountId);
}

export function saveTournamentFormats(db, { actorId, tournamentId, expectedRevision, operationId, config }) {
  ensureTournamentFormatStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:formats`, request: { expectedRevision, config } }, () => transaction(db, () => {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) fail('Tournament not found', 404);
    if (tournament.revision !== expectedRevision) fail('Tournament revision changed', 409);
    if (tournament.status !== 'registering') fail('Formats cannot change after the event starts', 409);
    if (!config || typeof config !== 'object' || Object.keys(config).some((key) => !FIELDS.includes(key))) fail('Invalid tournament format fields');
    for (const [key, value] of Object.entries(config)) {
      if (key.endsWith('_enabled') && typeof value !== 'boolean') fail(`${key} must be boolean`);
      if (key !== 'break_after_level' && !key.endsWith('_enabled') && (!Number.isSafeInteger(value) || value < 0)) fail(`${key} must be a nonnegative integer`);
      if (key === 'break_after_level' && value !== null && (!Number.isSafeInteger(value) || value < 1)) fail('break_after_level must be null or a positive integer');
    }
    const assignments = Object.keys(config).map((key) => `${key} = ?`).join(',');
    if (assignments) db.prepare(`UPDATE tournaments SET ${assignments} WHERE id = ?`).run(...Object.values(config).map((value) => typeof value === 'boolean' ? Number(value) : value), tournamentId);
    const revision = expectedRevision + 1;
    db.prepare('UPDATE tournaments SET revision = ? WHERE id = ?').run(revision, tournamentId);
    return { revision, state: { tournamentId, revision, config } };
  }));
}

export function rebuyTournament(db, { actorId, tournamentId, expectedRevision, operationId, seat }) {
  ensureTournamentFormatStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:rebuy`, request: { expectedRevision } }, () => transaction(db, () => {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) fail('Tournament not found', 404);
    if (tournament.revision !== expectedRevision) fail('Tournament revision changed', 409);
    if (!tournament.rebuy_enabled || tournament.status !== 'running') fail('Rebuy is unavailable', 409);
    if (!Number.isFinite(Date.parse(tournament.start_at))) fail('Late registration is closed', 409);
    if (Date.parse(tournament.start_at) + tournament.late_reg * 60000 < Date.now()) fail('Late registration is closed', 409);
    const participation = db.prepare('SELECT * FROM tournament_participation WHERE tournament_id = ? AND account_id = ?').get(tournamentId, actorId);
    if (!participation || participation.status !== 'eliminated') fail('Rebuy requires an eliminated entry', 409);
    if (participation.rebuy_count >= 3) fail('Rebuy limit reached', 409);
    const result = seat({ stack: tournament.rebuy_chips });
    if (!result.ok) fail(result.error || 'No seat available', 409);
    const charge = addTransactionEx(actorId, 'tourney_rebuy', -tournament.rebuy_price, `Tournament rebuy ${tournament.name}`, 'USD', { reference: `tournament:rebuy:${tournamentId}:${actorId}:${participation.rebuy_count + 1}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
    if (!charge.applied) fail('Rebuy was already recorded', 409);
    db.prepare("INSERT OR IGNORE INTO tourney_regs (tournament_id,user_id,created_at) VALUES (?,?,datetime('now'))").run(tournamentId, actorId);
    const entryOrder = participation.rebuy_count + 1;
    const entryId = `rebuy:${tournamentId}:${actorId}:${entryOrder}`;
    const initial = db.prepare("SELECT entry_id FROM tournament_entries WHERE tournament_id = ? AND account_id = ? AND entry_kind = 'initial'").get(tournamentId, actorId);
    if (!initial) fail('Initial tournament entry is missing', 409);
    db.prepare(`INSERT INTO tournament_entries (entry_id,tournament_id,account_id,entry_kind,entry_order,seat_identity,status,operation_id,created_at)
      VALUES (?,?,?,'rebuy',?,?,'active',?,datetime('now'))`).run(entryId, tournamentId, actorId, entryOrder, initial.entry_id, operationId);
    db.prepare("UPDATE tournament_participation SET status = 'active',rebuy_count = rebuy_count + 1 WHERE tournament_id = ? AND account_id = ?").run(tournamentId, actorId);
    const revision = expectedRevision + 1;
    db.prepare('UPDATE tournaments SET revision = ? WHERE id = ?').run(revision, tournamentId);
    return { revision, state: { tournamentId, tableId: result.tableId, tableIndex: result.index, entryId, rebuyCount: participation.rebuy_count + 1, stack: tournament.rebuy_chips, revision } };
  }));
}

export function reenterTournament(db, { actorId, tournamentId, expectedRevision, operationId, seat }) {
  ensureTournamentFormatStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:reentry`, request: { expectedRevision } }, () => transaction(db, () => {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) fail('Tournament not found', 404);
    if (tournament.revision !== expectedRevision) fail('Tournament revision changed', 409);
    if (!tournament.reentry_enabled || tournament.status !== 'running') fail('Re-entry is unavailable', 409);
    if (!Number.isFinite(Date.parse(tournament.start_at)) || Date.parse(tournament.start_at) + tournament.late_reg * 60000 < Date.now()) fail('Late registration is closed', 409);
    const participation = db.prepare('SELECT * FROM tournament_participation WHERE tournament_id = ? AND account_id = ?').get(tournamentId, actorId);
    if (!participation || participation.status !== 'eliminated') fail('Re-entry requires an eliminated entry', 409);
    if (participation.reentry_count >= 3) fail('Re-entry limit reached', 409);
    const entryOrder = participation.reentry_count + 1;
    const entryId = `reentry:${tournamentId}:${actorId}:${entryOrder}`;
    const result = seat({ stack: tournament.starting_stack });
    if (!result.ok) fail(result.error || 'No seat available', 409);
    const charge = addTransactionEx(actorId, 'tourney_reentry', -tournament.reentry_price, `Tournament re-entry ${tournament.name}`, 'USD', { reference: `tournament:reentry:${tournamentId}:${actorId}:${entryOrder}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
    if (!charge.applied) fail('Re-entry was already recorded', 409);
    db.prepare("INSERT OR IGNORE INTO tourney_regs (tournament_id,user_id,created_at) VALUES (?,?,datetime('now'))").run(tournamentId, actorId);
    db.prepare(`INSERT INTO tournament_entries (entry_id,tournament_id,account_id,entry_kind,entry_order,seat_identity,status,operation_id,created_at)
      VALUES (?,?,?,'reentry',?,?,'active',?,datetime('now'))`).run(entryId, tournamentId, actorId, entryOrder, entryId, operationId);
    db.prepare("UPDATE tournament_participation SET status = 'active',reentry_count = reentry_count + 1 WHERE tournament_id = ? AND account_id = ?").run(tournamentId, actorId);
    const revision = expectedRevision + 1;
    db.prepare('UPDATE tournaments SET revision = ? WHERE id = ?').run(revision, tournamentId);
    return { revision, state: { tournamentId, tableId: result.tableId, tableIndex: result.index, entryId, reentryCount: entryOrder, stack: tournament.starting_stack, revision } };
  }));
}

export function offlineTournamentEntry(db, { actorId, actorLogin, accountId, tournamentId, expectedRevision, operationId }) {
  ensureTournamentFormatStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:offline-entry`, request: { accountId, expectedRevision } }, () => transaction(db, () => {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) fail('Tournament not found', 404);
    if (tournament.revision !== expectedRevision) fail('Tournament revision changed', 409);
    if (!tournament.enabled || !['registering', 'running'].includes(tournament.status) || tournament.entrants >= tournament.max_players) fail('Registration is closed', 409);
    if (!Number.isFinite(Date.parse(tournament.start_at)) || Date.parse(tournament.start_at) + tournament.late_reg * 60000 < Date.now()) fail('Late registration is closed', 409);
    const account = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(accountId);
    if (!account) fail('Account is not eligible', 404);
    if (db.prepare('SELECT 1 FROM tournament_participation WHERE tournament_id = ? AND account_id = ? AND status IN (\'registered\',\'active\')').get(tournamentId, accountId)) fail('Already registered', 409);
    const total = tournament.buyin + tournament.fee;
    const charge = addTransactionEx(accountId, 'tourney_buyin', -total, `Offline tournament entry ${tournament.name}`, 'USD', { reference: `tournament:offline:${tournamentId}:${accountId}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
    if (!charge.applied) fail('Offline entry was already recorded', 409);
    db.prepare("INSERT OR IGNORE INTO tourney_regs (tournament_id,user_id,created_at) VALUES (?,?,datetime('now'))").run(tournamentId, accountId);
    recordInitialTournamentEntry(db, tournamentId, accountId);
    db.prepare('UPDATE tournaments SET entrants = entrants + 1 WHERE id = ?').run(tournamentId);
    const revision = expectedRevision + 1;
    db.prepare('UPDATE tournaments SET revision = ? WHERE id = ?').run(revision, tournamentId);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actorLogin || actorId, 'tournament_offline_entry', `${tournamentId} account ${accountId}`);
    return { revision, state: { tournamentId, accountId, entryId: `initial:${tournamentId}:${accountId}:0`, revision } };
  }));
}

export function disqualifyTournamentEntrant(db, { actorId, actorLogin, accountId, tournamentId, expectedRevision, operationId, reason, room }) {
  ensureTournamentFormatStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `tournament:${tournamentId}:disqualify`, request: { accountId, expectedRevision, reason } }, () => transaction(db, () => {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) fail('Tournament not found', 404);
    if (tournament.revision !== expectedRevision) fail('Tournament revision changed', 409);
    if (!['registering', 'running'].includes(tournament.status)) fail('Tournament is not active', 409);
    if (room?.anyHandInProgress?.()) fail('Disqualification applies after the current hand', 409);
    const participation = db.prepare("SELECT * FROM tournament_participation WHERE tournament_id = ? AND account_id = ? AND status IN ('registered','active')").get(tournamentId, accountId);
    if (!participation) fail('Active tournament entry not found', 404);
    const table = room?.tableOf(accountId);
    if (table) {
      const player = table.seatOf(accountId)?.player;
      if (player) {
        const place = room.playersRemaining() + room.finished.length;
        room.finished.push({ id: accountId, nick: player.nick, place, payout: 0, tableId: table.cfg.id });
        room.ops.persistBust({ tournamentId, tableId: table.cfg.id, playerId: accountId, nick: player.nick, place, payout: 0 });
        player.stack = 0;
        table.stand(accountId);
      }
    }
    db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').run(tournamentId, accountId);
    db.prepare("UPDATE tournament_entries SET status = 'disqualified' WHERE tournament_id = ? AND account_id = ? AND status IN ('registered','active')").run(tournamentId, accountId);
    db.prepare("UPDATE tournament_participation SET status = 'disqualified',disqualified_at = datetime('now') WHERE tournament_id = ? AND account_id = ?").run(tournamentId, accountId);
    const revision = expectedRevision + 1;
    db.prepare('UPDATE tournaments SET revision = ? WHERE id = ?').run(revision, tournamentId);
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actorLogin || actorId, 'tournament_disqualify', `${tournamentId} account ${accountId}: ${String(reason || '').slice(0, 200)}`);
    return { revision, state: { tournamentId, accountId, disqualified: true, refunded: 0, revision } };
  }));
}

export function driveFlipTable(table, handId) {
  if (table.tournament?.mode !== 'FLIP' || table.handId !== handId || !table.handInProgress()) return false;
  for (let actions = 0; actions < 200 && table.handInProgress(); actions++) {
    if (!table.actor) throw new Error('Flip hand has no actor');
    const result = table.act(table.actor, 'allin');
    if (!result.ok) throw new Error(`Flip action failed: ${result.error}`);
  }
  if (table.handInProgress()) throw new Error('Flip hand exceeded its action bound');
  return true;
}
