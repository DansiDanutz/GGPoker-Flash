import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './test-helpers.js';
import { spinPayouts } from './spin.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-restart-'));
let srv;
let eventId;
const players = [];

after(async () => {
  if (srv?.child?.exitCode == null && srv.child.signalCode == null) await srv.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function boot() {
  srv = await startServer({ dataDir });
  const adminToken = await srv.login('admin', 'admin123');
  return adminToken;
}

async function configure(adminToken) {
  const config = { rows: spinPayouts(5000).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
  const saved = await srv.put('/api/admin/spin/rules', { token: adminToken, body: { mode: '3max', stake: 5000, expectedRevision: 1, operationId: 'restart-rules', config, insurance: null } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  for (const scope of ['spin3:5000', 'spin3-insurance:5000']) {
    const funded = await srv.post(`/api/admin/house/${scope}/fund`, { token: adminToken, body: { amount: 200000000, reason: 'Restart test', operationId: `restart-fund-${scope}` } });
    assert.equal(funded.status, 200, JSON.stringify(funded.data));
  }
}

async function join(token, tableId, predicate = () => true) {
  const socket = srv.socket(token);
  await socket.opened;
  socket.send({ type: 'join_table', tableId });
  await socket.next((message) => message.type === 'joined' && message.tableId === tableId);
  const state = await socket.next((message) => message.type === 'state' && message.state.id === tableId && predicate(message.state));
  return { socket, state: state.state };
}

test('hard restart preserves pending presentation and then the active private hand without charging again', async () => {
  let adminToken = await boot();
  await configure(adminToken);
  for (const name of ['spin_restart_a', 'spin_restart_b', 'spin_restart_c']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
  const afterRegistration = [];
  for (const [index, player] of players.entries()) {
    const result = await srv.post('/api/spin/register', { token: player.token, body: { mode: '3max', stake: 5000, expectedRevision: index, ruleRevision: 2, operationId: `restart-register-${index}`, insurance: false } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    eventId = result.data.state.eventId;
    afterRegistration.push(await srv.balance(player.token));
  }
  const tableId = `spin:${eventId}`;
  const wheel = await srv.post(`/api/spin/${eventId}/presented`, { token: players[0].token, body: { expectedRevision: 1, operationId: 'restart-wheel-0', stage: 'wheel' } });
  assert.equal(wheel.status, 200, JSON.stringify(wheel.data));
  const beforeRestart = await join(players[0].token, tableId);
  const committed = { multiplier: beforeRestart.state.spin.multiplier, prize: beforeRestart.state.spin.prize };
  await beforeRestart.socket.close();
  await srv.stop();

  adminToken = await boot();
  assert.ok(adminToken);
  const pending = await join(players[0].token, tableId, (state) => state.spin?.eventId === eventId);
  assert.equal(pending.state.handNo, 0);
  assert.deepEqual(pending.state.spin.presentation.acknowledgements, ['wheel']);
  assert.deepEqual({ multiplier: pending.state.spin.multiplier, prize: pending.state.spin.prize }, committed);
  assert.equal(await srv.balance(players[0].token), afterRegistration[0]);
  await pending.socket.close();

  for (const [index, player] of players.entries()) {
    const stages = index === 0 ? ['ready'] : ['wheel', 'ready'];
    for (const stage of stages) {
      const expectedRevision = index * 2 + (stage === 'ready' ? 2 : 1);
      const result = await srv.post(`/api/spin/${eventId}/presented`, { token: player.token, body: { expectedRevision, operationId: `restart-${stage}-${index}`, stage } });
      assert.equal(result.status, 200, JSON.stringify(result.data));
    }
  }
  const active = await join(players[0].token, tableId, (state) => state.handNo === 1);
  const handId = active.state.handId;
  const cards = active.state.players.find((player) => player.isMe).cards;
  assert.equal(cards.length, 2);
  assert.equal(cards.every((card) => card !== '??'), true);
  await active.socket.close();
  await srv.stop();

  await boot();
  const restored = await join(players[0].token, tableId, (state) => state.handNo === 1);
  assert.equal(restored.state.handId, handId);
  assert.deepEqual(restored.state.players.find((player) => player.isMe).cards, cards);
  assert.deepEqual({ multiplier: restored.state.spin.multiplier, prize: restored.state.spin.prize }, committed);
  assert.equal(await srv.balance(players[0].token), afterRegistration[0]);
  await restored.socket.close();
  await srv.stop();
});


test('a corrupted private checkpoint quarantines only that Spin and never restores altered cards', async () => {
  const database = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  const checkpoint = database.prepare("SELECT * FROM game_checkpoints WHERE room_id = ? AND kind = 'spin' AND status = 'active'").get(`spin:${eventId}`);
  const state = JSON.parse(checkpoint.state_json);
  state.properties.deck[0] = state.properties.deck[1];
  database.prepare('UPDATE game_checkpoints SET state_json = ? WHERE room_id = ? AND kind = ? AND revision = ?').run(JSON.stringify(state), checkpoint.room_id, checkpoint.kind, checkpoint.revision);
  database.close();
  await boot();
  const socket = srv.socket(players[0].token);
  await socket.opened;
  socket.send({ type: 'join_table', tableId: `spin:${eventId}` });
  const refusal = await socket.next((message) => message.type === 'error' && message.errorCode === 'spin_recovery_unavailable');
  assert.ok(refusal);
  const reader = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  assert.equal(reader.prepare("SELECT status FROM game_checkpoints WHERE room_id = ? AND kind = 'spin' AND revision = ?").get(checkpoint.room_id, checkpoint.revision).status, 'quarantined');
  reader.close();
  await socket.close();
  await srv.stop();
});
