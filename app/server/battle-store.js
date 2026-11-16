import { activeGameCheckpoint, saveGameCheckpoint } from './game-checkpoints.js';
import { ensureBattleStore } from './battle-event.js';

export function ensureBattleRuntimeStore(db) {
  ensureBattleStore(db);
  db.exec(`CREATE TABLE IF NOT EXISTS battle_rooms (
    room_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    table_index INTEGER NOT NULL,
    round INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK(status IN ('active','complete')),
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(event_id,stage,table_index,round)
  );
  CREATE TABLE IF NOT EXISTS battle_finishes (
    event_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    place INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(event_id,account_id)
  );
  CREATE TABLE IF NOT EXISTS battle_prizes (
    event_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    place INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(event_id,account_id)
  );
  CREATE TABLE IF NOT EXISTS battle_qualification (
    event_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(event_id,account_id)
  );`);
}

export function createBattleRoom(db, { eventId, stage, tableIndex, round, roomId }) {
  ensureBattleRuntimeStore(db);
  db.prepare('INSERT OR IGNORE INTO battle_rooms (room_id,event_id,stage,table_index,round,status,revision,created_at) VALUES (?,?,?,?,?,\'active\',0,datetime(\'now\'))')
    .run(roomId, eventId, stage, tableIndex, round);
}

export function persistBattleRoom(db, { table, eventId, stage, round, transition, revision }) {
  createBattleRoom(db, { eventId, stage, tableIndex: table.cfg.tableIndex, round, roomId: table.cfg.id });
  const nextRevision = revision ?? table.cfg.battleRevision ?? 0;
  const checkpoint = saveGameCheckpoint(db, {
    roomId: table.cfg.id,
    kind: 'battle',
    operationId: `server:battle:${eventId}:${stage}:${round}:${nextRevision}:${table.messageSeq}:${transition}`,
    rules: { eventId, stage, round, revision: nextRevision, clock: table.battleClock || null },
    state: table.recoveryState(),
    tableVersion: table.tableVersion,
  });
  table.cfg.battleRevision = nextRevision;
  db.prepare('UPDATE battle_rooms SET revision = ? WHERE room_id = ?').run(nextRevision, table.cfg.id);
  return checkpoint;
}

export function restoreBattleRoom(db, roomId) {
  const checkpoint = activeGameCheckpoint(db, roomId, 'battle');
  if (!checkpoint) throw new Error('Active Battle checkpoint is missing');
  if (checkpoint.schema_version !== 1 || checkpoint.engine_version !== '1') throw new Error('Unsupported Battle checkpoint');
  return { checkpoint, rules: JSON.parse(checkpoint.rules_json), state: JSON.parse(checkpoint.state_json) };
}
