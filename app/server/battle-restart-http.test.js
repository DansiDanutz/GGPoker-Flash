import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-battle-restart-'));
let srv;
const players = [];
const config = {
  id: 'battle-restart', name: 'Restart Battle', capacity: 2, finalSeats: 2, startingChips: 1000, entry: 1000,
  rushMinutes: 10, tableSize: 2, smallBlind: 10, bigBlind: 20, rushStartLevel: 1, shootoutStartLevel: 1,
  finalStartLevel: 1, prizeShares: [50, 50], bountyItems: [{ id: 'b1', amount: 500, frequencyUnits: 1 }],
};

async function state(viewer = players[0]) {
  const response = await srv.get('/api/battle/battle-restart', { token: viewer.token });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.state;
}

async function action(room, actor, operationId) {
  const response = await srv.post('/api/battle/battle-restart/action', { token: actor.token, body: {
    eventId: 'battle-restart', stage: room.stage, roomId: room.roomId, handId: room.table.handId,
    expectedRevision: room.revision, operationId, action: 'allin', amount: 0,
  } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

async function stop() {
  if (!srv) return;
  await srv.stop();
  srv = null;
}

after(stop);

test('Battle resumes the same private hand and settles exactly once across hard restarts', async () => {
  srv = await startServer({ dataDir });
  const adminToken = await srv.login('admin', 'admin123');
  for (const name of ['battle_restart_a', 'battle_restart_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
  assert.equal((await srv.post('/api/admin/battle', { token: adminToken, body: { operationId: 'create-restart-battle', config } })).status, 200);
  await srv.post('/api/battle/battle-restart/register', { token: players[0].token, body: { eventId: 'battle-restart', expectedRevision: 1, operationId: 'restart-register-a' } });
  await srv.post('/api/battle/battle-restart/register', { token: players[1].token, body: { eventId: 'battle-restart', expectedRevision: 2, operationId: 'restart-register-b' } });
  const before = await state();
  assert.equal(before.status, 'final');
  const room = before.rooms[0];
  const actor = players.find((player) => player.id === room.table.actor);
  const opponent = players.find((player) => player.id !== actor.id);
  const actorState = await state(actor);
  const actorRoom = actorState.rooms[0];
  const first = await action(actorRoom, actor, 'restart-first-action');
  const pending = await state(opponent);
  assert.equal(pending.rooms[0].table.handId, room.table.handId);
  assert.equal(pending.rooms[0].table.actor, opponent.id);
  const privateCards = pending.rooms[0].table.players.find((player) => player.isMe).cards;
  assert.equal(privateCards.length, 2);
  const walletBeforeRestart = await Promise.all(players.map((player) => srv.balance(player.token)));
  await stop();

  srv = await startServer({ dataDir });
  const restored = await state(opponent);
  assert.equal(restored.rooms[0].table.handId, room.table.handId);
  assert.equal(restored.rooms[0].table.actor, opponent.id);
  assert.deepEqual(restored.rooms[0].table.players.find((player) => player.isMe).cards, privateCards);
  assert.equal(JSON.stringify(restored).includes('"deck"'), false);
  assert.deepEqual(await Promise.all(players.map((player) => srv.balance(player.token))), walletBeforeRestart);
  const replayRoom = (await state(actor)).rooms[0];
  assert.deepEqual(await action(replayRoom, actor, 'restart-first-action'), first);
  const conflict = await srv.post('/api/battle/battle-restart/action', { token: actor.token, body: {
    eventId: 'battle-restart', stage: replayRoom.stage, roomId: replayRoom.roomId, handId: replayRoom.table.handId,
    expectedRevision: replayRoom.revision, operationId: 'restart-first-action', action: 'call', amount: 0,
  } });
  assert.equal(conflict.status, 409);

  let finished;
  for (let attempt = 0; attempt < 80; attempt++) {
    const current = await state(players[attempt % 2]);
    if (current.status === 'finished') { finished = current; break; }
    const active = current.rooms.find((entry) => entry.stage === current.status);
    if (active?.table.actor) await action(active, players.find((player) => player.id === active.table.actor), `restart-resume-${attempt}`);
    else await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(finished);
  const balancesAfterSettlement = await Promise.all(players.map((player) => srv.balance(player.token)));
  await stop();

  srv = await startServer({ dataDir });
  const terminal = await state();
  assert.equal(terminal.status, 'finished');
  assert.deepEqual(terminal.prizes, finished.prizes);
  assert.deepEqual(terminal.bounty.awards, finished.bounty.awards);
  assert.deepEqual(await Promise.all(players.map((player) => srv.balance(player.token))), balancesAfterSettlement);
  const database = new DatabaseSync(path.join(dataDir, 'ggpoker.db'), { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM game_checkpoints WHERE kind = 'battle' AND status = 'active'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transactions WHERE kind IN ('battle_prize','battle_bounty')").get().count, 3);
  database.close();
});
