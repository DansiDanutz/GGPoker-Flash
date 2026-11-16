import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';

let srv;
let admin;
const players = [];
const tournamentId = 'addon-event';

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  for (const name of ['addon_a', 'addon_b', 'addon_c', 'addon_d']) {
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
      if (message.type === 'state' && message.state.actor === players.find((player) => player.token === token).id) socket.send({ type: 'action', tableId: `tourney-${tournamentId}`, action: 'allin', amount: 0 });
      return false;
    }, 15000);
  } finally { await socket.close(); }
}

async function status(id = tournamentId) { return (await srv.get(`/api/tournaments/${id}`)).data.tournament; }

test('add-on is single-use inside the configured pause and running cancellation refunds only active entries', async () => {
  await srv.post('/api/admin/tournaments', { token: admin, body: { id: tournamentId, name: 'Add-on test', game: 'holdem', buyin: 100, fee: 0, gtd: 0, starting_stack: 1000, start_at: new Date().toISOString(), late_reg: 60, blind_speed: 5 } });
  await srv.post(`/api/admin/tournaments/${tournamentId}/formats`, { token: admin, body: { expectedRevision: 1, operationId: 'configure-addon', config: { addon_enabled: true, addon_price: 100, addon_chips: 500, break_after_level: 1 } } });
  for (const player of players) await srv.post(`/api/tournaments/${tournamentId}/register`, { token: player.token, body: {} });
  for (const player of players) await srv.post(`/api/tournaments/${tournamentId}/play`, { token: player.token, body: {} });
  assert.equal((await srv.post(`/api/admin/tournaments/${tournamentId}/pause`, { token: admin, body: { expectedRevision: 2, operationId: 'pause-addon', reason: 'Scheduled add-on break' } })).status, 200);
  await Promise.all(players.map((player) => allIn(player.token)));
  let paused;
  for (let attempt = 0; attempt < 150; attempt++) {
    const current = await status();
    if (current.status === 'paused') { paused = current; break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(paused, 'Tournament did not pause after the settled hand');
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  const active = db.prepare("SELECT account_id FROM tournament_participation WHERE tournament_id = ? AND status = 'active'").all(tournamentId);
  const player = players.find((entry) => entry.id === active[0].account_id);
  const before = await srv.balance(player.token);
  const addon = await srv.post(`/api/tournaments/${tournamentId}/addon`, { token: player.token, body: { expectedRevision: paused.revision, operationId: 'addon-once' } });
  assert.equal(addon.status, 200, JSON.stringify(addon.data));
  assert.equal(addon.data.state.addedChips, 500);
  assert.equal(await srv.balance(player.token), before - 100);
  assert.deepEqual((await srv.post(`/api/tournaments/${tournamentId}/addon`, { token: player.token, body: { expectedRevision: paused.revision, operationId: 'addon-once' } })).data, addon.data);
  assert.equal(await srv.balance(player.token), before - 100);
  assert.equal((await srv.post(`/api/tournaments/${tournamentId}/addon`, { token: player.token, body: { expectedRevision: addon.data.revision, operationId: 'addon-twice' } })).status, 409);
  const resumed = await srv.post(`/api/admin/tournaments/${tournamentId}/resume`, { token: admin, body: { expectedRevision: addon.data.revision, operationId: 'resume-addon', reason: 'Add-on window complete' } });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.data));
  assert.equal((await status()).status, 'running');

  db.close();
});

test('running cancellation refunds every active entry once without a dealt hand', async () => {
  const id = 'cancel-running';
  await srv.post('/api/admin/tournaments', { token: admin, body: { id, name: 'Running cancel', game: 'holdem', buyin: 100, fee: 0, starting_stack: 1000, status: 'running', start_at: new Date(Date.now() + 3600000).toISOString(), late_reg: 60 } });
  const selected = players.slice(0, 2);
  const before = new Map();
  for (const player of selected) {
    await srv.post(`/api/tournaments/${id}/register`, { token: player.token, body: {} });
    before.set(player.id, await srv.balance(player.token));
  }
  const result = await srv.post(`/api/admin/tournaments/${id}/cancel`, { token: admin, body: { expectedRevision: 1, operationId: 'cancel-running', reason: 'Owner stopped the event' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal((await status(id)).status, 'cancelled');
  for (const player of selected) assert.equal(await srv.balance(player.token), before.get(player.id) + 100);
});

test('registering cancellation refunds the entry once and needs no live table', async () => {
  const id = 'cancel-registering';
  await srv.post('/api/admin/tournaments', { token: admin, body: { id, name: 'Registration cancel', game: 'holdem', buyin: 100, fee: 0, starting_stack: 1000, start_at: new Date(Date.now() + 3600000).toISOString(), late_reg: 60 } });
  const player = players[0];
  await srv.post(`/api/tournaments/${id}/register`, { token: player.token, body: {} });
  const before = await srv.balance(player.token);
  const result = await srv.post(`/api/admin/tournaments/${id}/cancel`, { token: admin, body: { expectedRevision: 1, operationId: 'cancel-registering', reason: 'Owner cancelled before play' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal((await status(id)).status, 'cancelled');
  assert.equal(await srv.balance(player.token), before + 100);
});
