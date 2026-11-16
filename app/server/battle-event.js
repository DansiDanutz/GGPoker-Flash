import { addTransactionEx } from './db.js';
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

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} must be an integer from ${minimum} to ${maximum}`);
  return value;
}

export function validateBattleConfig(input) {
  if (!input || typeof input.id !== 'string' || !/^[\w-]{1,64}$/.test(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) fail('Invalid Battle event identity');
  const config = {
    id: input.id,
    name: input.name.trim(),
    capacity: integer(input.capacity, 2, 100, 'Capacity'),
    finalSeats: integer(input.finalSeats, 2, 6, 'Final seats'),
    startingChips: integer(input.startingChips, 20, 1000000, 'Starting chips'),
    entry: integer(input.entry, 0, 1000000, 'Entry'),
    rushMinutes: integer(input.rushMinutes, 1, 120, 'Rush duration'),
    tableSize: integer(input.tableSize, 2, 6, 'Table size'),
    smallBlind: integer(input.smallBlind, 1, 1000000000, 'Small blind'),
    bigBlind: integer(input.bigBlind, 1, 1000000000, 'Big blind'),
    rushStartLevel: integer(input.rushStartLevel, 1, 20, 'Rush start level'),
    shootoutStartLevel: integer(input.shootoutStartLevel, 1, 20, 'Shootout start level'),
    finalStartLevel: integer(input.finalStartLevel, 1, 20, 'Final start level'),
    prizeShares: input.prizeShares,
    bountyItems: input.bountyItems || [],
  };
  if (config.finalSeats > config.capacity || config.smallBlind > config.bigBlind) fail('Invalid Battle seats or blinds');
  if (!Array.isArray(config.prizeShares) || !config.prizeShares.length || config.prizeShares.length > config.finalSeats || config.prizeShares.some((value, index) => !Number.isSafeInteger(value) || value < 1 || (index && value > config.prizeShares[index - 1])) || config.prizeShares.reduce((sum, value) => sum + value, 0) !== 100) fail('Prize shares must total 100 in nonincreasing order');
  if (!Array.isArray(config.bountyItems) || config.bountyItems.length > 1000) fail('Bounty inventory is invalid');
  let total = 0;
  const itemIds = new Set();
  for (const [index, item] of config.bountyItems.entries()) {
    if (!item || typeof item.id !== 'string' || !item.id || itemIds.has(item.id) || !Number.isSafeInteger(item.amount) || item.amount < 0 || !Number.isSafeInteger(item.frequencyUnits) || item.frequencyUnits < 1) fail('Bounty item is invalid');
    itemIds.add(item.id);
    total += item.amount;
    config.bountyItems[index] = { id: item.id, amount: item.amount, frequencyUnits: item.frequencyUnits, itemOrder: index };
  }
  if (total > 1000000000) fail('Bounty inventory exceeds the limit');
  return config;
}

export function ensureBattleStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS battle_events (
    event_id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('registering','rush','draining','shootout','final','finished','aborted')),
    revision INTEGER NOT NULL CHECK(revision>0),
    created_at TEXT NOT NULL,
    started_at TEXT,
    deadline TEXT,
    stage_started_at TEXT,
    current_level INTEGER,
    level_started_at TEXT
  );
  CREATE TABLE IF NOT EXISTS battle_registrations (
    event_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    entry_order INTEGER NOT NULL,
    stack INTEGER NOT NULL CHECK(stack>=0),
    status TEXT NOT NULL CHECK(status IN ('active','cancelled','eliminated','qualified')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(event_id,account_id),
    UNIQUE(event_id,entry_order)
  );
  CREATE TABLE IF NOT EXISTS battle_bounty_items (
    event_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>=0),
    frequency_units INTEGER NOT NULL CHECK(frequency_units>0),
    remaining_units INTEGER NOT NULL CHECK(remaining_units>=0),
    item_order INTEGER NOT NULL,
    PRIMARY KEY(event_id,item_id),
    UNIQUE(event_id,item_order)
  );`);
}

export function createBattleEvent(db, { actorId, operationId, config: input }) {
  const config = validateBattleConfig(input);
  ensureBattleStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `battle:create:${config.id}`, request: { config } }, () => transaction(db, () => {
    if (db.prepare('SELECT 1 FROM battle_events WHERE event_id = ?').get(config.id)) fail('Battle event already exists', 409);
    db.prepare(`INSERT INTO battle_events (event_id,config_json,status,revision,created_at) VALUES (?,?, 'registering',1,datetime('now'))`).run(config.id, JSON.stringify(config));
    for (const item of config.bountyItems) db.prepare('INSERT INTO battle_bounty_items (event_id,item_id,amount,frequency_units,remaining_units,item_order) VALUES (?,?,?,?,?,?)').run(config.id, item.id, item.amount, item.frequencyUnits, item.frequencyUnits, item.itemOrder);
    return { revision: 1, state: { eventId: config.id, status: 'registering', revision: 1 } };
  }));
}

function event(db, eventId) {
  const row = db.prepare('SELECT * FROM battle_events WHERE event_id = ?').get(eventId);
  if (!row) fail('Battle event not found', 404);
  return row;
}

export function battleEventState(db, eventId, actorId = null) {
  const row = event(db, eventId);
  const config = JSON.parse(row.config_json);
  const count = db.prepare("SELECT COUNT(*) AS count FROM battle_registrations WHERE event_id = ? AND status != 'cancelled'").get(eventId).count;
  const remaining = db.prepare("SELECT COUNT(*) AS count FROM battle_registrations WHERE event_id = ? AND status IN ('active','qualified')").get(eventId).count;
  const mine = actorId == null ? null : db.prepare("SELECT entry_order,stack,status FROM battle_registrations WHERE event_id = ? AND account_id = ?").get(eventId, actorId);
  return { eventId, name: config.name, status: row.status, revision: row.revision, config, registeredCount: count, playersRemaining: remaining, deadline: row.deadline, currentLevel: row.current_level, levelStartedAt: row.level_started_at, myRegistration: mine ? { entryOrder: mine.entry_order, stack: mine.stack, status: mine.status } : null };
}

export function registerBattle(db, { actorId, eventId, expectedRevision, operationId }) {
  ensureBattleStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `battle:${eventId}:register`, request: { eventId, expectedRevision } }, () => transaction(db, () => {
    const current = event(db, eventId);
    if (current.revision !== expectedRevision || current.status !== 'registering') fail('Battle registration is closed', 409);
    if (db.prepare("SELECT 1 FROM battle_registrations WHERE event_id = ? AND account_id = ? AND status = 'active'").get(eventId, actorId)) fail('Already registered', 409);
    const config = JSON.parse(current.config_json);
    const count = db.prepare("SELECT COUNT(*) AS count FROM battle_registrations WHERE event_id = ? AND status = 'active'").get(eventId).count;
    if (count >= config.capacity) fail('Battle event is full', 409);
    const entry = addTransactionEx(actorId, 'battle_entry', -config.entry, `Battle Royale entry ${config.name}`, 'USD', { reference: `battle:entry:${eventId}:${actorId}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
    if (!entry.applied) fail('Battle entry was already recorded', 409);
    db.prepare('INSERT INTO battle_registrations (event_id,account_id,entry_order,stack,status,created_at) VALUES (?,?,?,?,\'active\',datetime(\'now\'))').run(eventId, actorId, count, config.startingChips);
    const started = count + 1 === config.capacity;
    const revision = current.revision + 1;
    db.prepare(`UPDATE battle_events SET revision = ?, status = ?, started_at = CASE WHEN ? THEN datetime('now') ELSE started_at END,
      deadline = CASE WHEN ? THEN datetime('now', '+${config.rushMinutes} minutes') ELSE deadline END,
      stage_started_at = CASE WHEN ? THEN datetime('now') ELSE stage_started_at END,
      current_level = CASE WHEN ? THEN ? ELSE current_level END,
      level_started_at = CASE WHEN ? THEN datetime('now') ELSE level_started_at END WHERE event_id = ?`)
      .run(revision, started ? 'rush' : 'registering', started, started, started, started, config.rushStartLevel, started, eventId);
    return { revision, state: battleEventState(db, eventId, actorId) };
  }));
}

export function cancelBattle(db, { actorId, eventId, expectedRevision, operationId }) {
  ensureBattleStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `battle:${eventId}:cancel`, request: { eventId, expectedRevision } }, () => transaction(db, () => {
    const current = event(db, eventId);
    if (current.revision !== expectedRevision || current.status !== 'registering') fail('Battle cancellation is closed', 409);
    const registration = db.prepare("SELECT * FROM battle_registrations WHERE event_id = ? AND account_id = ? AND status = 'active'").get(eventId, actorId);
    if (!registration) fail('Battle registration not found', 404);
    const config = JSON.parse(current.config_json);
    const refund = addTransactionEx(actorId, 'battle_refund', config.entry, `Battle Royale cancellation ${config.name}`, 'USD', { reference: `battle:refund:${eventId}:${actorId}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
    if (!refund.applied) fail('Battle refund was already recorded', 409);
    db.prepare("UPDATE battle_registrations SET status = 'cancelled' WHERE event_id = ? AND account_id = ?").run(eventId, actorId);
    const revision = current.revision + 1;
    db.prepare('UPDATE battle_events SET revision = ? WHERE event_id = ?').run(revision, eventId);
    return { revision, state: battleEventState(db, eventId, actorId) };
  }));
}

export function reopenBattle(db, { actorId, eventId, expectedRevision, operationId }) {
  ensureBattleStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `battle:${eventId}:reopen`, request: { eventId, expectedRevision } }, () => {
    const current = event(db, eventId);
    if (current.revision !== expectedRevision || current.status === 'aborted') fail('Battle cannot be reopened', 409);
    const registration = db.prepare('SELECT status FROM battle_registrations WHERE event_id = ? AND account_id = ?').get(eventId, actorId);
    if (!registration) fail('Battle registration not found', 404);
    if (registration.status === 'cancelled') fail('Cancelled registrations cannot be reopened', 409);
    return { revision: current.revision, state: battleEventState(db, eventId, actorId) };
  });
}

export function abortBattle(db, { actorId, eventId, expectedRevision, operationId }) {
  ensureBattleStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `battle:${eventId}:abort`, request: { eventId, expectedRevision } }, () => transaction(db, () => {
    const current = event(db, eventId);
    if (current.revision !== expectedRevision || current.status !== 'registering') fail('Only an unstarted Battle event can be aborted', 409);
    const config = JSON.parse(current.config_json);
    for (const registration of db.prepare("SELECT * FROM battle_registrations WHERE event_id = ? AND status = 'active'").all(eventId)) {
      const refund = addTransactionEx(registration.account_id, 'battle_refund', config.entry, `Battle Royale abort ${config.name}`, 'USD', { reference: `battle:refund:${eventId}:${registration.account_id}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
      if (!refund.applied) fail('Battle refund was already recorded', 409);
    }
    db.prepare("UPDATE battle_registrations SET status = 'cancelled' WHERE event_id = ?").run(eventId);
    const revision = current.revision + 1;
    db.prepare("UPDATE battle_events SET revision = ?, status = 'aborted' WHERE event_id = ?").run(revision, eventId);
    return { revision, state: battleEventState(db, eventId, actorId) };
  }));
}
