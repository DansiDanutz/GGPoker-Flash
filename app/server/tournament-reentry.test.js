import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';

let srv;
let admin;
const players = [];
const tournamentId = 'reentry-event';

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  for (const name of ['reentry_a', 'reentry_b', 'reentry_c']) {
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
      if (message.type === 'state' && message.state.actor === players.find((player) => player.token === token).id) {
        socket.send({ type: 'action', tableId: `tourney-${tournamentId}`, action: 'allin', amount: 0, handNo: message.state.handNo, turnNo: message.state.turnNo });
      }
      return false;
    }, 15000);
  } finally { await socket.close(); }
}

test('re-entry creates a new paid attempt and enforces the initial-plus-three limit', async () => {
  await srv.post('/api/admin/tournaments', { token: admin, body: { id: tournamentId, name: 'Re-entry test', game: 'holdem', buyin: 100, fee: 0, gtd: 0, starting_stack: 1000, start_at: new Date().toISOString(), late_reg: 60, blind_speed: 5 } });
  const configured = await srv.post(`/api/admin/tournaments/${tournamentId}/formats`, { token: admin, body: { expectedRevision: 1, operationId: 'configure-reentry', config: { reentry_enabled: true, reentry_price: 200 } } });
  assert.equal(configured.status, 200, JSON.stringify(configured.data));
  for (const player of players) await srv.post(`/api/tournaments/${tournamentId}/register`, { token: player.token, body: {} });
  for (const player of players) await srv.post(`/api/tournaments/${tournamentId}/play`, { token: player.token, body: {} });
  await Promise.all(players.map((player) => allIn(player.token)));

  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  let eliminated;
  for (let attempt = 0; attempt < 400 && !eliminated; attempt++) {
    eliminated = db.prepare("SELECT account_id FROM tournament_participation WHERE tournament_id = ? AND status = 'eliminated'").get(tournamentId);
    if (!eliminated) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(eliminated);
  const player = players.find((entry) => entry.id === eliminated.account_id);
  const initialEntry = db.prepare("SELECT entry_id FROM tournament_entries WHERE tournament_id = ? AND account_id = ? AND entry_kind = 'initial'").get(tournamentId, player.id);
  const before = await srv.balance(player.token);
  const response = await srv.post(`/api/tournaments/${tournamentId}/reentry`, { token: player.token, body: { expectedRevision: 2, operationId: 'reentry-once' } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.state.stack, 1000);
  assert.equal(response.data.state.reentryCount, 1);
  assert.notEqual(response.data.state.entryId, initialEntry.entry_id);
  assert.equal(await srv.balance(player.token), before - 200);
  const replay = await srv.post(`/api/tournaments/${tournamentId}/reentry`, { token: player.token, body: { expectedRevision: 2, operationId: 'reentry-once' } });
  assert.deepEqual(replay.data, response.data);
  assert.equal(await srv.balance(player.token), before - 200);
  const count = db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE kind = ? AND user_id = ?').get('tourney_reentry', player.id);
  assert.equal(count.count, 1);
  const attempt = db.prepare("SELECT entry_kind,seat_identity,status FROM tournament_entries WHERE entry_id = ?").get(response.data.state.entryId);
  assert.deepEqual({ ...attempt }, { entry_kind: 'reentry', seat_identity: response.data.state.entryId, status: 'active' });
  db.prepare("UPDATE tournament_participation SET status = 'eliminated',reentry_count = 3 WHERE tournament_id = ? AND account_id = ?").run(tournamentId, player.id);
  db.prepare('UPDATE tournaments SET revision = 3 WHERE id = ?').run(tournamentId);
  const refused = await srv.post(`/api/tournaments/${tournamentId}/reentry`, { token: player.token, body: { expectedRevision: 3, operationId: 'reentry-fourth' } });
  assert.equal(refused.status, 409);
  assert.equal(await srv.balance(player.token), before - 200);
  db.close();
});
