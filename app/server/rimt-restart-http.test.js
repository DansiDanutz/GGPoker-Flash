import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, seatHumans } from './test-helpers.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-rimt-restart-'));
const tableId = 'rimt-restart-table';
const players = [];
let srv;
let proposer;
let decider;
let handId;
let finalBoards;
const afterBuyin = [];

after(async () => {
  if (srv?.child?.exitCode == null && srv.child.signalCode == null) await srv.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function join(player, predicate = () => true) {
  const socket = srv.socket(player.token);
  await socket.opened;
  socket.send({ type: 'join_table', tableId });
  await socket.next((message) => message.type === 'joined' && message.tableId === tableId);
  const message = await socket.next((msg) => msg.type === 'state' && msg.state.id === tableId && predicate(msg.state), 10000);
  return { socket, state: message.state };
}

test('pending RIMT and final boards restore without refunds, redraws or duplicate rating history', { timeout: 45000 }, async () => {
  srv = await startServer({ dataDir });
  const adminToken = await srv.login('admin', 'admin123');
  const created = await srv.post('/api/admin/tables', { token: adminToken, body: { id: tableId, name: 'RIMT Restart', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, rimt_mode: 'negotiated' } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  for (const name of ['rimt_restart_a', 'rimt_restart_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id, socket: srv.socket(response.data.token) });
  }
  for (const player of players) await player.socket.opened;
  await seatHumans(players.map((player) => player.socket), tableId, 4000);
  for (const player of players) afterBuyin.push(await srv.balance(player.token));
  for (const player of players) {
    player.socket.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== 'state') return;
      const me = msg.state.players.find((seat) => seat?.isMe);
      if (me && msg.state.actor === me.id) player.socket.send({ type: 'action', tableId, action: 'allin', amount: 0, handNo: msg.state.handNo, turnNo: msg.state.turnNo });
    });
  }
  const negotiation = await Promise.any(players.map((player) => player.socket.next((msg) => msg.type === 'state' && msg.state.rimt, 15000)));
  handId = negotiation.state.handId;
  proposer = players.find((player) => player.id === negotiation.state.players[negotiation.state.rimt.proposer]?.id);
  decider = players.find((player) => player !== proposer);
  const suggested = await srv.post(`/api/rooms/${tableId}/rimt`, { token: proposer.token, body: { handId, expectedRevision: 0, operationId: 'restart-rimt-suggest', choice: 2 } });
  assert.equal(suggested.status, 200, JSON.stringify(suggested.data));
  for (const player of players) await player.socket.close();
  await srv.stop();

  srv = await startServer({ dataDir });
  const pending = await join(decider, (state) => state.rimt?.proposal === 2);
  assert.equal(pending.state.handId, handId);
  assert.equal(pending.state.rimt.phase, 'decide');
  assert.equal(pending.state.rimt.revision, 1);
  assert.equal(await srv.balance(decider.token), afterBuyin[players.indexOf(decider)]);
  await pending.socket.close();
  const accepted = await srv.post(`/api/rooms/${tableId}/rimt`, { token: decider.token, body: { handId, expectedRevision: 1, operationId: 'restart-rimt-accept', choice: 'accept' } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const final = await join(decider, (state) => state.result?.rimt?.runs === 2 && state.boards?.length === 2);
  finalBoards = final.state.boards;
  assert.equal(final.state.handId, handId);
  await final.socket.close();
  await srv.stop();

  srv = await startServer({ dataDir });
  const restored = await join(decider, (state) => state.result?.rimt?.runs === 2 && state.boards?.length === 2);
  assert.equal(restored.state.handId, handId);
  assert.deepEqual(restored.state.boards, finalBoards);
  assert.equal(await srv.balance(decider.token), afterBuyin[players.indexOf(decider)]);
  await restored.socket.close();
  const reader = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  assert.equal(reader.prepare('SELECT COUNT(*) AS count FROM elo_history WHERE hand_id = ?').get(handId).count, 2);
  reader.close();
  await srv.stop();
});


test('a corrupted final-board checkpoint quarantines the cash table instead of restoring it', async () => {
  const database = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  const checkpoint = database.prepare("SELECT * FROM game_checkpoints WHERE room_id = ? AND kind = 'rimt' AND status = 'active'").get(tableId);
  const state = JSON.parse(checkpoint.state_json);
  state.properties.boards[0][0] = state.properties.boards[0][1];
  database.prepare('UPDATE game_checkpoints SET state_json = ? WHERE room_id = ? AND kind = ? AND revision = ?').run(JSON.stringify(state), checkpoint.room_id, checkpoint.kind, checkpoint.revision);
  database.close();
  srv = await startServer({ dataDir });
  const socket = srv.socket(decider.token);
  await socket.opened;
  socket.send({ type: 'join_table', tableId });
  const refusal = await socket.next((message) => message.type === 'error' && message.errorCode === 'rimt_recovery_unavailable');
  assert.ok(refusal);
  const reader = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  assert.equal(reader.prepare("SELECT status FROM game_checkpoints WHERE room_id = ? AND kind = 'rimt' AND revision = ?").get(tableId, checkpoint.revision).status, 'quarantined');
  reader.close();
  await socket.close();
  await srv.stop();
});
