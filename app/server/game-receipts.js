import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function ensureGameReceipts(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS operation_receipts (
    actor_id INTEGER NOT NULL,
    operation_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    request_json TEXT NOT NULL,
    committed_revision INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(actor_id, operation_id, scope)
  )`);
}

export function withGameReceipt(db, { actorId, operationId, scope, request }, command) {
  ensureGameReceipts(db);
  const requestJson = JSON.stringify(canonical(request));
  const requestHash = createHash('sha256').update(requestJson).digest('hex');
  const prior = db.prepare('SELECT request_hash,response_json FROM operation_receipts WHERE actor_id = ? AND operation_id = ? AND scope = ?').get(actorId, operationId, scope);
  if (prior) {
    if (prior.request_hash !== requestHash) return { status: 409, body: { ok: false, errorCode: 'operation_conflict', message: 'Operation ID was already used for another request' } };
    return { status: 200, body: JSON.parse(prior.response_json), replayed: true };
  }
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const result = command();
    const response = { ok: true, operationId, revision: result.revision, state: result.state };
    db.prepare('INSERT INTO operation_receipts (actor_id,operation_id,scope,request_hash,request_json,committed_revision,response_json) VALUES (?,?,?,?,?,?,?)')
      .run(actorId, operationId, scope, requestHash, requestJson, result.revision, JSON.stringify(response));
    if (ownsTransaction) db.exec('COMMIT');
    return { status: 200, body: response, replayed: false };
  } catch (error) {
    if (ownsTransaction) db.exec('ROLLBACK');
    return { status: error.status || 500, body: { ok: false, errorCode: 'command_rejected', message: error.message } };
  }
}
