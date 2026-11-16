export function ensureGameCheckpoints(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS game_checkpoints (
    room_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),
    operation_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    engine_version TEXT NOT NULL,
    rules_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','terminal','quarantined')),
    state_json TEXT NOT NULL,
    reason TEXT,
    table_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(room_id,kind,revision)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_active_game_checkpoint ON game_checkpoints(room_id,kind) WHERE status='active';`);
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

export function saveGameCheckpoint(db, { roomId, kind, operationId, rules, state, tableVersion = 0 }) {
  ensureGameCheckpoints(db);
  return transaction(db, () => {
    const previous = db.prepare("SELECT revision FROM game_checkpoints WHERE room_id = ? AND kind = ? AND status = 'active'").get(roomId, kind);
    const latest = db.prepare('SELECT MAX(revision) AS revision FROM game_checkpoints WHERE room_id = ? AND kind = ?').get(roomId, kind);
    const revision = (latest?.revision || 0) + 1;
    if (previous) db.prepare("UPDATE game_checkpoints SET status = 'terminal', updated_at = datetime('now') WHERE room_id = ? AND kind = ? AND revision = ?").run(roomId, kind, previous.revision);
    db.prepare(`INSERT INTO game_checkpoints
      (room_id,kind,revision,operation_id,schema_version,engine_version,rules_json,status,state_json,table_version)
      VALUES (?,?,?,?,?,?,?,'active',?,?)`).run(roomId, kind, revision, operationId, 1, '1', JSON.stringify(rules), JSON.stringify(state), tableVersion);
    return { revision };
  });
}

export function activeGameCheckpoint(db, roomId, kind) {
  ensureGameCheckpoints(db);
  return db.prepare("SELECT * FROM game_checkpoints WHERE room_id = ? AND kind = ? AND status = 'active'").get(roomId, kind);
}

export function activeGameCheckpoints(db, kind) {
  ensureGameCheckpoints(db);
  return db.prepare("SELECT * FROM game_checkpoints WHERE kind = ? AND status = 'active' ORDER BY room_id").all(kind);
}

export function terminalGameCheckpoint(db, roomId, kind, reason = 'finished') {
  ensureGameCheckpoints(db);
  return db.prepare("UPDATE game_checkpoints SET status = 'terminal', reason = ?, updated_at = datetime('now') WHERE room_id = ? AND kind = ? AND status = 'active'").run(reason, roomId, kind);
}

export function quarantineGameCheckpoint(db, roomId, kind, reason) {
  ensureGameCheckpoints(db);
  return db.prepare("UPDATE game_checkpoints SET status = 'quarantined', reason = ?, updated_at = datetime('now') WHERE room_id = ? AND kind = ? AND status = 'active'").run(reason, roomId, kind);
}
