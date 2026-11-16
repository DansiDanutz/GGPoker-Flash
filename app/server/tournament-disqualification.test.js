import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';

let srv;
let admin;
const players = [];
const tournamentId = 'offline-event';

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  for (const name of ['offline_a', 'offline_b', 'offline_c']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
});

after(async () => { await srv.stop(); });

async function allIn(token) {
  const socket = srv.socket(token);
  await socket.opened;
  try {
    socket.send({ type: 'join_table', tableId: `tourney-${tournamentId}` });
    await socket.next((message) => {
      if (message.type === 'state' && message.state.street === 'ended') return true;
      if (message.type === 'state' && message.state.actor === players.find((player) => player.token === token).id) socket.send({ type: 'action', tableId: `tourney-${tournamentId}`, action: 'allin', amount: 0, handNo: message.state.handNo, turnNo: message.state.turnNo });
      return false;
    }, 15000);
  } finally { await socket.close(); }
}

test('offline entry charges once and disqualification forfeits without a refund', async () => {
  await srv.post('/api/admin/tournaments', { token: admin, body: { id: tournamentId, name: 'Offline test', game: 'holdem', buyin: 100, fee: 0, starting_stack: 1000, start_at: new Date(Date.now() + 3600000).toISOString(), late_reg: 60 } });
  const player = players[0];
  const forbidden = await srv.post(`/api/admin/tournaments/${tournamentId}/entries`, { token: player.token, body: { accountId: player.id, expectedRevision: 1, operationId: 'offline-forbidden' } });
  assert.equal(forbidden.status, 403);
  const before = await srv.balance(player.token);
  const entered = await srv.post(`/api/admin/tournaments/${tournamentId}/entries`, { token: admin, body: { accountId: player.id, expectedRevision: 1, operationId: 'offline-entry' } });
  assert.equal(entered.status, 200, JSON.stringify(entered.data));
  assert.equal(await srv.balance(player.token), before - 100);
  assert.deepEqual((await srv.post(`/api/admin/tournaments/${tournamentId}/entries`, { token: admin, body: { accountId: player.id, expectedRevision: 1, operationId: 'offline-entry' } })).data, entered.data);
  assert.equal(await srv.balance(player.token), before - 100);
  const disqualified = await srv.post(`/api/admin/tournaments/${tournamentId}/disqualify`, { token: admin, body: { accountId: player.id, expectedRevision: 2, operationId: 'offline-disqualify', reason: 'Eligibility review' } });
  assert.equal(disqualified.status, 200, JSON.stringify(disqualified.data));
  assert.equal(disqualified.data.state.refunded, 0);
  assert.equal(await srv.balance(player.token), before - 100);
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  const participation = db.prepare('SELECT status,disqualified_at FROM tournament_participation WHERE tournament_id = ? AND account_id = ?').get(tournamentId, player.id);
  assert.equal(participation.status, 'disqualified');
  assert.ok(participation.disqualified_at);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'tournament_disqualify'").get());
  db.close();
});

test('an active hand blocks disqualification until it settles', async () => {
  const player = players[0];
  for (const entry of players) await srv.post(`/api/tournaments/${tournamentId}/register`, { token: entry.token, body: {} });
  for (const entry of players) await srv.post(`/api/tournaments/${tournamentId}/play`, { token: entry.token, body: {} });
  const pending = await srv.post(`/api/admin/tournaments/${tournamentId}/disqualify`, { token: admin, body: { accountId: player.id, expectedRevision: 3, operationId: 'disqualify-mid-hand', reason: 'Mid-hand test' } });
  assert.equal(pending.status, 409);
  await Promise.all(players.map((entry) => allIn(entry.token)));
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  const active = db.prepare("SELECT account_id FROM tournament_participation WHERE tournament_id = ? AND status = 'active'").all(tournamentId);
  assert.ok(active.length);
  const target = active[0].account_id;
  const before = await srv.balance(players.find((entry) => entry.id === target).token);
  const result = await srv.post(`/api/admin/tournaments/${tournamentId}/disqualify`, { token: admin, body: { accountId: target, expectedRevision: 3, operationId: 'disqualify-settled', reason: 'Settled-hand test' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(await srv.balance(players.find((entry) => entry.id === target).token), before);
  db.close();
});
