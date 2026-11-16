import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';
import { spinPayouts } from './spin.js';
import { quarantineGameCheckpoint, saveGameCheckpoint } from './game-checkpoints.js';

let srv;
let adminToken;
let eventId;
let lastPlayer;
const players = [];

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  const config = { rows: spinPayouts(5000).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
  await srv.put('/api/admin/spin/rules', { token: adminToken, body: { mode: '3max', stake: 5000, expectedRevision: 1, operationId: 'terminal-replay-rules', config, insurance: null } });
  await srv.post('/api/admin/house/spin3:5000/fund', { token: adminToken, body: { amount: 200000000, reason: 'Terminal replay test', operationId: 'terminal-replay-fund' } });
  for (const name of ['terminal_a', 'terminal_b', 'terminal_c']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
});
after(async () => { await srv.stop(); });

test('quarantine-cancelled events cannot be reactivated by registration replay', async () => {
  for (const [index, player] of players.entries()) {
    const result = await srv.post('/api/spin/register', { token: player.token, body: { mode: '3max', stake: 5000, expectedRevision: index, ruleRevision: 2, operationId: `terminal-register-${index}`, insurance: false } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    eventId = result.data.state.eventId;
    lastPlayer = { ...player, operationId: `terminal-register-${index}` };
  }
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  saveGameCheckpoint(db, { roomId: `spin:${eventId}`, kind: 'spin', operationId: 'terminal-replay-checkpoint', rules: {}, state: {} });
  quarantineGameCheckpoint(db, `spin:${eventId}`, 'spin', 'injected terminal recovery failure');
  db.close();
  const cancelled = await srv.post(`/api/admin/spin/${eventId}/cancel`, { token: adminToken, body: { expectedRevision: 1, operationId: 'terminal-quarantine-cancel' } });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  const replay = await srv.post('/api/spin/register', { token: lastPlayer.token, body: { mode: '3max', stake: 5000, expectedRevision: 2, ruleRevision: 2, operationId: lastPlayer.operationId, insurance: false } });
  assert.equal(replay.status, 200, JSON.stringify(replay.data));
  assert.equal(replay.data.state.status, 'matched');
  const reader = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'), { readOnly: true });
  assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM game_checkpoints WHERE room_id = ? AND kind = 'spin' AND status = 'active'").get(`spin:${eventId}`).count, 0);
  assert.equal(reader.prepare('SELECT status FROM spin_events WHERE event_id = ?').get(eventId).status, 'cancelled');
  reader.close();
});
