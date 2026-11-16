import { randomUUID } from 'node:crypto';
import { handForViewer, publicHandCards, publicHandResult } from './hand-history.js';
import { withGameReceipt } from './game-receipts.js';

function parseJson(text, fallback) {
  try { return JSON.parse(text || '') ?? fallback; } catch { return fallback; }
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
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

export function ensureShareHandStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS hand_identities (
    hand_id TEXT PRIMARY KEY,
    hand_row INTEGER NOT NULL UNIQUE,
    revision INTEGER NOT NULL CHECK(revision>=0)
  );
  CREATE TABLE IF NOT EXISTS hand_shares (
    share_id TEXT PRIMARY KEY,
    hand_row INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );`);
  db.prepare('INSERT OR IGNORE INTO hand_identities (hand_id,hand_row,revision) SELECT hand_id,id,0 FROM hands WHERE hand_id IS NOT NULL').run();
}

function aggregate(db, pathId) {
  ensureShareHandStore(db);
  const row = /^\d+$/.test(pathId)
    ? db.prepare('SELECT * FROM hands WHERE id = ?').get(Number(pathId))
    : db.prepare('SELECT h.* FROM hands h JOIN hand_identities i ON i.hand_row = h.id WHERE i.hand_id = ?').get(pathId);
  if (!row) fail('Hand not found', 404);
  const handId = row.hand_id || String(row.id);
  db.prepare('INSERT OR IGNORE INTO hand_identities (hand_id,hand_row,revision) VALUES (?,?,0)').run(handId, row.id);
  const identity = db.prepare('SELECT * FROM hand_identities WHERE hand_row = ?').get(row.id);
  return { row, handId, revision: identity.revision };
}

function hidden(db, handRow) {
  return !!db.prepare('SELECT 1 FROM hidden_hands WHERE hand_row = ? LIMIT 1').get(handRow);
}

function trustedPlayers(row) {
  const players = parseJson(row.players, []);
  if (!Array.isArray(players) || players.length < 2) fail('Hand cannot be shared', 404);
  for (const player of players) {
    if (!player || !(Number.isSafeInteger(player.id) || (typeof player.id === 'string' && player.id)) || !Number.isInteger(player.seat) || player.seat < 0 || player.inHand !== true || !Number.isSafeInteger(player.stackBefore) || player.stackBefore < 0 || !Array.isArray(player.shownIndices) || !Array.isArray(player.cards) || !Number.isSafeInteger(player.grossContribution ?? player.totalBet) || (player.grossContribution ?? player.totalBet) < 0) fail('Hand cannot be shared', 404);
  }
  return players;
}

function publicProjection(db, row) {
  if (hidden(db, row.id)) fail('Shared hand not found', 404);
  const players = trustedPlayers(row);
  const actions = parseJson(row.actions, []);
  if (!Array.isArray(actions) || actions.some((action) => !Number.isInteger(action.seat) || action.seat < 0)) fail('Hand cannot be shared', 404);
  const result = parseJson(row.result, {}) || {};
  const projected = publicHandResult(result, players);
  const publicResult = {
    reason: projected.reason || null,
    pot: Number.isSafeInteger(projected.pot) ? projected.pot : row.pot,
    board: projected.board || row.board,
    winners: (projected.winners || []).map((winner) => ({ nick: winner.nick, seat: winner.seat, amount: winner.amount, hand: winner.hand || null, cards: winner.cards || [] })),
    hands: (projected.hands || []).map((hand) => ({ nick: hand.nick, seat: hand.seat, hand: hand.hand || null, cards: hand.cards || [] })),
  };
  return {
    handId: row.hand_id || String(row.id), tableName: row.table_name, game: row.game, playedAt: row.created_at,
    board: row.board,
    players: players.map((player) => ({
      nick: player.nick, seat: player.seat, stackBefore: player.stackBefore,
      contribution: Number.isSafeInteger(player.grossContribution) ? player.grossContribution : player.totalBet,
      award: player.win, publicCards: publicHandCards(player, result),
    })),
    actions: actions.map((action) => ({ street: action.street, seat: action.seat, nick: action.nick, action: action.action, ...(Number.isSafeInteger(action.amount) ? { amount: action.amount } : {}) })),
    result: publicResult,
  };
}

export function sharedHand(db, shareId) {
  ensureShareHandStore(db);
  const share = db.prepare('SELECT * FROM hand_shares WHERE share_id = ? AND revoked_at IS NULL').get(shareId);
  if (!share) fail('Shared hand not found', 404);
  const row = db.prepare('SELECT * FROM hands WHERE id = ?').get(share.hand_row);
  if (!row) fail('Shared hand not found', 404);
  return publicProjection(db, row);
}

export function createHandShare(db, { actorId, pathId, expectedRevision, operationId }) {
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `hand:${pathId}:share`, request: { expectedRevision } }, () => {
    const { row, handId, revision } = aggregate(db, pathId);
    if (revision !== expectedRevision) fail('Hand revision changed', 409);
    if (!handForViewer(row, actorId) || hidden(db, row.id)) fail('Hand cannot be shared', 404);
    trustedPlayers(row);
    const actions = parseJson(row.actions, []);
    if (!Array.isArray(actions) || actions.some((action) => !Number.isInteger(action.seat) || action.seat < 0)) fail('Hand cannot be shared', 404);
    const shareId = randomUUID();
    db.prepare('INSERT INTO hand_shares (share_id,hand_row,owner_id,created_at) VALUES (?,?,?,datetime(\'now\'))').run(shareId, row.id, actorId);
    const next = revision + 1;
    db.prepare('UPDATE hand_identities SET revision = ? WHERE hand_row = ?').run(next, row.id);
    return { revision: next, state: { shareId, handId, revision: next, url: `/share/${shareId}` } };
  }));
}

export function revokeHandShare(db, { actorId, admin, pathId, shareId, expectedRevision, operationId }) {
  return transaction(db, () => withGameReceipt(db, { actorId, operationId, scope: `hand:${pathId}:share:revoke`, request: { shareId, expectedRevision } }, () => {
    const { row, revision } = aggregate(db, pathId);
    if (revision !== expectedRevision) fail('Hand revision changed', 409);
    const share = db.prepare('SELECT * FROM hand_shares WHERE share_id = ? AND hand_row = ?').get(shareId, row.id);
    if (!share) fail('Share not found', 404);
    if (share.owner_id !== actorId && !admin) fail('Only the share creator can revoke this link', 403);
    if (!share.revoked_at) {
      db.prepare('UPDATE hand_shares SET revoked_at = datetime(\'now\') WHERE share_id = ?').run(shareId);
      const next = revision + 1;
      db.prepare('UPDATE hand_identities SET revision = ? WHERE hand_row = ?').run(next, row.id);
      return { revision: next, state: { shareId, revision: next, revoked: true } };
    }
    return { revision, state: { shareId, revision, revoked: true } };
  }));
}
